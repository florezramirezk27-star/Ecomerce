import { LoadingState } from "@/components/Feedback";

export default function ProductDetailLoading() {
  return <LoadingState label="Cargando producto..." rows={2} />;
}
