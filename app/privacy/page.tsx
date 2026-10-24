import PublicInformation from "../public-information";
import "../public-information.css";
import { pageMetadata } from "../../lib/seo";

export const metadata = pageMetadata("/privacy");
export default function PrivacyPage() {
  return <PublicInformation kind="privacy" />;
}
