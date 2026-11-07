import { profile } from "@/lib/content";
import { HomePage } from "@/components/home-page";

export default function RootPage() {
  return <HomePage role={profile.role} at="/" />;
}
