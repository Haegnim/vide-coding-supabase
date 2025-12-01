import { NextRequest, NextResponse } from "next/server";

// 포트원 API 시크릿
const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET!;

// 고유 결제 ID 생성 함수
function generatePaymentId() {
  return `payment-${Array.from(crypto.getRandomValues(new Uint32Array(2)))
    .map((word) => word.toString(16).padStart(8, "0"))
    .join("")}`;
}

interface PaymentRequestBody {
  billingKey: string;
  orderName: string;
  amount: number;
  customer: {
    id: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: PaymentRequestBody = await request.json();
    const { billingKey, orderName, amount, customer } = body;

    // 필수 파라미터 검증
    if (!billingKey || !orderName || !amount || !customer?.id) {
      return NextResponse.json(
        { success: false, message: "필수 파라미터가 누락되었습니다." },
        { status: 400 }
      );
    }

    const paymentId = generatePaymentId();

    // 포트원 빌링키 결제 API 호출
    const paymentResponse = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(
        paymentId
      )}/billing-key`,
      {
        method: "POST",
        headers: {
          Authorization: `PortOne ${PORTONE_API_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          billingKey,
          orderName,
          customer: {
            id: customer.id,
          },
          amount: {
            total: amount,
          },
          currency: "KRW",
        }),
      }
    );

    if (!paymentResponse.ok) {
      const errorData = await paymentResponse.json();
      console.error("포트원 결제 API 오류:", errorData);
      return NextResponse.json(
        {
          success: false,
          message: errorData.message || "결제 처리에 실패했습니다.",
        },
        { status: 500 }
      );
    }

    const paymentResult = await paymentResponse.json();
    console.log("결제 성공:", paymentResult);

    return NextResponse.json({
      success: true,
      paymentId,
      data: paymentResult,
    });
  } catch (error) {
    console.error("결제 처리 중 오류:", error);
    return NextResponse.json(
      { success: false, message: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
