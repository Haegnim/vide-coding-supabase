import { NextRequest, NextResponse } from "next/server";

// 포트원 API 시크릿
const PORTONE_API_SECRET = process.env.PORTONE_API_SECRET!;

interface CancelRequestBody {
  transactionKey: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: CancelRequestBody = await request.json();
    const { transactionKey } = body;

    // 필수 파라미터 검증
    if (!transactionKey) {
      return NextResponse.json(
        { success: false, message: "transactionKey가 누락되었습니다." },
        { status: 400 }
      );
    }

    // 포트원 결제 취소 API 호출
    const cancelResponse = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(transactionKey)}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `PortOne ${PORTONE_API_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: "취소 사유 없음",
        }),
      }
    );

    if (!cancelResponse.ok) {
      const errorData = await cancelResponse.json();
      console.error("포트원 결제 취소 API 오류:", errorData);
      return NextResponse.json(
        { success: false },
        { status: 500 }
      );
    }

    console.log("결제 취소 성공:", transactionKey);

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("결제 취소 처리 중 오류:", error);
    return NextResponse.json(
      { success: false },
      { status: 500 }
    );
  }
}

