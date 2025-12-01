"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as PortOne from "@portone/browser-sdk/v2";

// 고유 ID 생성 함수
function generateId() {
  return Array.from(crypto.getRandomValues(new Uint32Array(2)))
    .map((word) => word.toString(16).padStart(8, "0"))
    .join("");
}

interface UsePaymentHookReturn {
  isLoading: boolean;
  error: string | null;
  handleSubscribe: () => Promise<void>;
}

export function usePaymentHook(): UsePaymentHookReturn {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. 빌링키 발급 요청
      const issueResponse = await PortOne.requestIssueBillingKey({
        storeId: process.env.NEXT_PUBLIC_PORTONE_STORE_ID!,
        channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY!,
        billingKeyMethod: "CARD",
        issueId: `issue-${generateId()}`,
        issueName: "IT 매거진 월간 구독",
        customer: {
          customerId: `customer-${generateId()}`,
        },
      });

      // 빌링키 발급 실패 처리
      if (issueResponse?.code !== undefined) {
        setError(issueResponse.message || "빌링키 발급에 실패했습니다.");
        setIsLoading(false);
        return;
      }

      // 빌링키가 없는 경우
      if (!issueResponse?.billingKey) {
        setError("빌링키를 발급받지 못했습니다.");
        setIsLoading(false);
        return;
      }

      // 2. 빌링키로 결제 API 요청
      const paymentResponse = await fetch("/api/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          billingKey: issueResponse.billingKey,
          orderName: "IT 매거진 월간 구독",
          amount: 9900,
          customer: {
            id: `customer-${generateId()}`,
          },
        }),
      });

      const paymentResult = await paymentResponse.json();

      if (!paymentResult.success) {
        setError(paymentResult.message || "결제에 실패했습니다.");
        setIsLoading(false);
        return;
      }

      // 3. 구독 성공 처리
      alert("구독에 성공하였습니다.");
      router.push("/magazines");
    } catch (err) {
      console.error("구독 처리 중 오류 발생:", err);
      setError("구독 처리 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    error,
    handleSubscribe,
  };
}
