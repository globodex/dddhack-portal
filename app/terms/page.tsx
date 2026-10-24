import PublicInformation from "../public-information";
import "../public-information.css";
import { pageMetadata } from "../../lib/seo";

export const metadata = pageMetadata("/terms");
export default function TermsPage() {
  return <PublicInformation kind="terms" />;
}
