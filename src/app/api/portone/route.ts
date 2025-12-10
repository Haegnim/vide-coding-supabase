import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { randomUUID } from "crypto";
import axios from "axios";

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

// 포트원 예약된 결제정보 타입
interface PortoneScheduleItem {
  id: string;
  paymentId: string;
  billingKey: string;
  status: string;
  scheduledAt: string;
}

interface PortoneScheduleResponse {
  items: PortoneScheduleItem[];
}

/**
 * 포트원 API에서 예약된 결제정보 조회 (GET with body - axios 사용)
 */
async function getScheduledPayments(
  billingKey: string,
  fromDate: Date,
  untilDate: Date
): Promise<PortoneScheduleResponse> {
  const response = await axios({
    method: "GET",
    url: "https://api.portone.io/payment-schedules",
    headers: {
      Authorization: `PortOne ${process.env.PORTONE_API_SECRET}`,
      "Content-Type": "application/json",
    },
    data: {
      filter: {
        billingKey,
        from: fromDate.toISOString(),
        until: untilDate.toISOString(),
      },
    },
  });

  return response.data;
}

/**
 * 포트원 API에서 예약된 결제 취소
 */
async function cancelScheduledPayments(scheduleIds: string[]): Promise<void> {
  const response = await fetch("https://api.portone.io/payment-schedules", {
    method: "DELETE",
    headers: {
      Authorization: `PortOne ${process.env.PORTONE_API_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      scheduleIds,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      `포트원 예약 취소 실패: ${errorData.message || response.statusText}`
    );
  }
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
    `https://api.portone.io/payments/${encodeURIComponent(
      nextScheduleId
    )}/schedule`,
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
      // 3-1) 구독결제취소시나리오

      // 3-1-1) supabase에서 payment 조회 (transaction_key === payment_id)
      const { data: paymentRecord, error: selectError } = await supabase
        .from("payment")
        .select("*")
        .eq("transaction_key", payment_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (selectError || !paymentRecord) {
        console.error("Supabase select error:", selectError);
        return NextResponse.json({ success: false }, { status: 404 });
      }

      // 3-1-2) supabase의 payment 테이블에 취소 레코드 등록
      const { error: insertError } = await supabase.from("payment").insert({
        transaction_key: paymentRecord.transaction_key,
        amount: -paymentRecord.amount,
        status: "Cancel",
        start_at: paymentRecord.start_at,
        end_at: paymentRecord.end_at,
        end_grace_at: paymentRecord.end_grace_at,
        next_schedule_at: paymentRecord.next_schedule_at,
        next_schedule_id: paymentRecord.next_schedule_id,
      });

      if (insertError) {
        console.error("Supabase insert error:", insertError);
        return NextResponse.json({ success: false }, { status: 500 });
      }

      // 3-2) 다음달구독예약취소시나리오

      // 3-2-1) 포트원에서 결제정보 조회
      const paymentInfo = await getPaymentInfo(payment_id);

      // 3-2-2) 예약된 결제정보 조회 (next_schedule_at 기준 ±1일)
      if (paymentInfo.billingKey && paymentRecord.next_schedule_at) {
        const nextScheduleAt = new Date(paymentRecord.next_schedule_at);
        const fromDate = new Date(
          nextScheduleAt.getTime() - 24 * 60 * 60 * 1000
        );
        const untilDate = new Date(
          nextScheduleAt.getTime() + 24 * 60 * 60 * 1000
        );

        try {
          const scheduledPayments = await getScheduledPayments(
            paymentInfo.billingKey,
            fromDate,
            untilDate
          );

          // 3-2-3) next_schedule_id와 일치하는 항목 추출
          const targetSchedule = scheduledPayments.items?.find(
            (item) => item.paymentId === paymentRecord.next_schedule_id
          );

          // 3-2-4) 포트원에 다음달 구독예약 취소
          if (targetSchedule) {
            await cancelScheduledPayments([targetSchedule.id]);
          }
        } catch (scheduleError) {
          console.error("Schedule cancellation error:", scheduleError);
          // 예약 취소 실패해도 결제 취소는 성공한 것으로 처리
        }
      }

      return NextResponse.json({ success: true }, { status: 200 });
    }

    // 알 수 없는 status
    return NextResponse.json({ success: false }, { status: 400 });
  } catch (error) {
    console.error("Portone webhook error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
