import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

interface MagazineItem {
  id: string;
  image_url: string;
  category: string;
  title: string;
  description: string;
  tags: string[] | null;
}

export const useMagazineList = () => {
  const [magazines, setMagazines] = useState<MagazineItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMagazines = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // 1-1) Supabase에서 데이터 조회
        // ANON 키는 Supabase 클라이언트에서 자동으로 사용됩니다
        const { data, error: fetchError } = await supabase
          .from("magazine")
          .select("id, image_url, category, title, description, tags")
          .limit(10);

        if (fetchError) {
          throw fetchError;
        }

        // 1-2) 조회 성공 - 실제 데이터로 설정
        setMagazines(data || []);
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "데이터 조회 중 오류가 발생했습니다.";
        setError(errorMessage);
        console.error("매거진 목록 조회 오류:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMagazines();
  }, []);

  return {
    magazines,
    isLoading,
    error,
  };
};
