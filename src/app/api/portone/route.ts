import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { randomUUID } from "crypto";

// 요청 데이터 타입
interface PortoneWebhookRequest {
  payment_id: string;
  status: "Paid" | "Cancelled";
}

// 응답 데이터 타입
interface PortoneWebhookResponse {
  success: boolean;
}

// 포트원 결제 정보 타입 (필요한 필드만 정의)
interface PortonePaymentInfo {
  id: string;
  status: string;
  billingKey?: string;
  orderName: string;
  amount: {
    total: number;
    taxFree: number;
    vat?: number;
    supply?: number;
    discount: number;
    paid: number;
    cancelled: number;
    cancelledTaxFree: number;
  };
  customer: {
    id?: string;
    name?: string;
    email?: string;
    phoneNumber?: string;
  };
  currency: string;
}

// 한국 시간대 오프셋 (UTC+9)
const KST_OFFSET = 9 * 60 * 60 * 1000;

/**
 * 포트원 API에서 결제 정보 조회
 */
async function getPaymentInfo(paymentId: string): Promise<PortonePaymentInfo> {
  const response = await fetch(
    `https://api.portone.io/payments/${encodeURIComponent(paymentId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `PortOne ${process.env.PORTONE_API_SECRET}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      `포트원 결제 조회 실패: ${errorData.message || response.statusText}`
    );
  }

  return response.json();
}

/**
 * 포트원 API에 다음달 구독결제 예약
 */
async function scheduleNextPayment(
  nextScheduleId: string,
  billingKey: string,
  orderName: string,
  customerId: string | undefined,
  amount: number,
  nextScheduleAt: Date
): Promise<void> {
  const requestBody = {
    payment: {
      billingKey,
      orderName,
      customer: customerId ? { id: customerId } : undefined,
      amount: {
        total: amount,
      },
      currency: "KRW",
    },
    timeToPay: nextScheduleAt.toISOString(),
  };

  const response = await fetch(
    `https://api.portone.io/payments/${encodeURIComponent(nextScheduleId)}/schedule`,
    {
      method: "POST",
      headers: {
        Authorization: `PortOne ${process.env.PORTONE_API_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      `포트원 결제 예약 실패: ${errorData.message || response.statusText}`
    );
  }
}

/**
 * end_at + 1일 밤 11:59:59 (KST) -> UTC로 변환
 */
function calculateEndGraceAt(endAt: Date): Date {
  // end_at + 1일
  const nextDay = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);

  // 해당 날짜의 KST 23:59:59 계산
  // KST 23:59:59 = UTC 14:59:59 (다음날)
  const kstDate = new Date(nextDay.getTime() + KST_OFFSET);
  const kstYear = kstDate.getUTCFullYear();
  const kstMonth = kstDate.getUTCMonth();
  const kstDay = kstDate.getUTCDate();

  // KST 23:59:59를 UTC로 변환
  const endGraceKst = new Date(
    Date.UTC(kstYear, kstMonth, kstDay, 23, 59, 59, 0)
  );
  const endGraceUtc = new Date(endGraceKst.getTime() - KST_OFFSET);

  return endGraceUtc;
}

/**
 * end_at + 1일 오전 10시~11시 (KST) 사이 임의 시각 -> UTC로 변환
 */
function calculateNextScheduleAt(endAt: Date): Date {
  // end_at + 1일
  const nextDay = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);

  // 해당 날짜의 KST 기준으로 계산
  const kstDate = new Date(nextDay.getTime() + KST_OFFSET);
  const kstYear = kstDate.getUTCFullYear();
  const kstMonth = kstDate.getUTCMonth();
  const kstDay = kstDate.getUTCDate();

  // 10시~11시 사이 랜덤 분/초
  const randomMinutes = Math.floor(Math.random() * 60);
  const randomSeconds = Math.floor(Math.random() * 60);

  // KST 10:XX:XX를 UTC로 변환
  const scheduleKst = new Date(
    Date.UTC(kstYear, kstMonth, kstDay, 10, randomMinutes, randomSeconds, 0)
  );
  const scheduleUtc = new Date(scheduleKst.getTime() - KST_OFFSET);

  return scheduleUtc;
}

/**
 * POST /api/portone
 * 포트원 웹훅 처리 - 구독결제 완료 및 다음달 예약
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<PortoneWebhookResponse>> {
  try {
    const body: PortoneWebhookRequest = await request.json();
    const { payment_id, status } = body;

    // 입력값 검증
    if (!payment_id || !status) {
      return NextResponse.json({ success: false }, { status: 400 });
    }

    if (status === "Paid") {
      // 2-1) 구독결제완료시나리오

      // 2-1-1) paymentId의 결제정보 조회
      const paymentInfo = await getPaymentInfo(payment_id);

      // 현재 시각 (UTC)
      const now = new Date();

      // start_at: 현재시각
      const startAt = now;

      // end_at: 현재시각 + 30일
      const endAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      // end_grace_at: end_at + 1일 밤 11:59:59 (KST) -> UTC
      const endGraceAt = calculateEndGraceAt(endAt);

      // next_schedule_at: end_at + 1일 오전 10시~11시 (KST) 사이 임의 시각 -> UTC
      const nextScheduleAt = calculateNextScheduleAt(endAt);

      // next_schedule_id: 임의로 생성한 UUID
      const nextScheduleId = randomUUID();

      // 2-1-2) supabase의 payment 테이블에 등록
      const { error: insertError } = await supabase.from("payment").insert({
        transaction_key: paymentInfo.id,
        amount: paymentInfo.amount.total,
        status: "Paid",
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        end_grace_at: endGraceAt.toISOString(),
        next_schedule_at: nextScheduleAt.toISOString(),
        next_schedule_id: nextScheduleId,
      });

      if (insertError) {
        console.error("Supabase insert error:", insertError);
        return NextResponse.json({ success: false }, { status: 500 });
      }

      // 2-2) 다음달구독예약시나리오
      // 2-2-1) 포트원에 다음달 구독결제 예약
      if (paymentInfo.billingKey) {
        await scheduleNextPayment(
          nextScheduleId,
          paymentInfo.billingKey,
          paymentInfo.orderName,
          paymentInfo.customer?.id,
          paymentInfo.amount.total,
          nextScheduleAt
        );
      }

      return NextResponse.json({ success: true }, { status: 200 });
    }

    if (status === "Cancelled") {
      // Cancelled 시나리오는 요구사항에 명시되지 않음
      // 필요시 여기에 구현
      return NextResponse.json({ success: true }, { status: 200 });
    }

    // 알 수 없는 status
    return NextResponse.json({ success: false }, { status: 400 });
  } catch (error) {
    console.error("Portone webhook error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

