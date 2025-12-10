"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface CancelSubscriptionResponse {
  success: boolean;
}

export function usePaymentCancel() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const cancelSubscription = async (transactionKey: string) => {
    if (!transactionKey) {
      alert("거래 키가 없습니다.");
      return false;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/payments/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transactionKey,
        }),
      });

      const data: CancelSubscriptionResponse = await response.json();

      if (data.success) {
        alert("구독이 취소되었습니다.");
        router.push("/magazines");
        return true;
      } else {
        alert("구독 취소에 실패했습니다.");
        return false;
      }
    } catch (error) {
      console.error("구독 취소 중 오류:", error);
      alert("구독 취소 중 오류가 발생했습니다.");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    cancelSubscription,
    isLoading,
  };
}
