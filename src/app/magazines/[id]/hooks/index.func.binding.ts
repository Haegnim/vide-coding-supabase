import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

interface MagazineData {
  id: string;
  image_url: string;
  category: string;
  title: string;
  description: string;
  content: string;
  tags: string[] | null;
}

export const useMagazineDetail = (id: string) => {
  const [magazine, setMagazine] = useState<MagazineData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMagazine = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // 1-1) Supabase에서 데이터 조회
        // ANON 키는 Supabase 클라이언트에서 자동으로 사용됩니다
        const { data, error: fetchError } = await supabase
          .from("magazine")
          .select("id, image_url, category, title, description, content, tags")
          .eq("id", id)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        if (!data) {
          throw new Error("매거진을 찾을 수 없습니다.");
        }

        // 1-2) 조회 성공 - 데이터 설정
        setMagazine(data);
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "데이터 조회 중 오류가 발생했습니다.";
        setError(errorMessage);
        console.error("매거진 조회 오류:", err);
      } finally {
        setIsLoading(false);
      }
    };

    if (id) {
      fetchMagazine();
    }
  }, [id]);

  return {
    magazine,
    isLoading,
    error,
  };
};
