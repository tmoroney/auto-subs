import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/kit";

type BackLinkProps = {
  onBack: () => void;
};

export function BackLink({ onBack }: BackLinkProps) {
  const { t } = useTranslation();

  return (
    <Button
      variant="ghost"
      className="as-back-link"
      onClick={onBack}
    >
      <ChevronLeft size={16} />
      {t("common.back")}
    </Button>
  );
}
