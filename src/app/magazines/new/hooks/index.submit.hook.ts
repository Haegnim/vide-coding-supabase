import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface SubmitData {
  category: string;
  title: string;
  description: string;
  content: string;
  tags: string[] | null;
  imageFile?: File | null;
}

export const useSubmitMagazine = () => {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitMagazine = async (data: SubmitData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      let imageUrl: string | null = null;

      // 이미지 파일이 있는 경우 Supabase Storage에 업로드
      if (data.imageFile) {
        // 파일명 생성: yyyy/mm/dd/{UUID}.jpg
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        const uuid = crypto.randomUUID();

        // 파일 확장자 추출
        const fileExtension = data.imageFile.name.split(".").pop() || "jpg";
        const fileName = `${year}/${month}/${day}/${uuid}.${fileExtension}`;

        // Supabase Storage에 파일 업로드
        const { error: uploadError } = await supabase.storage
          .from("vibe-coding-supabase-storage")
          .upload(fileName, data.imageFile);

        if (uploadError) {
          throw new Error(`이미지 업로드 실패: ${uploadError.message}`);
        }

        // 업로드된 파일의 public URL 생성
        const { data: urlData } = supabase.storage
          .from("vibe-coding-supabase-storage")
          .getPublicUrl(fileName);

        imageUrl = urlData.publicUrl;
      }

      // 1-1) Supabase에 데이터 등록
      // ANON 키는 Supabase 클라이언트에서 자동으로 사용됩니다
      const { data: insertedData, error: insertError } = await supabase
        .from("magazine")
        .insert([
          {
            image_url: imageUrl,
            category: data.category,
            title: data.title,
            description: data.description,
            content: data.content,
            tags: data.tags,
          },
        ])
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      // 1-2) 등록 성공 이후 로직
      // 알림 메시지
      alert("등록에 성공하였습니다.");

      // 이동할 페이지: /magazines/[id]
      if (insertedData?.id) {
        router.push(`/magazines/${insertedData.id}`);
      } else {
        // id가 없는 경우 목록 페이지로 이동
        router.push("/magazines");
      }

      return { success: true, data: insertedData };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "등록 중 오류가 발생했습니다.";
      setError(errorMessage);
      alert(`등록 실패: ${errorMessage}`);
      return { success: false, error: errorMessage };
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    submitMagazine,
    isSubmitting,
    error,
  };
};
