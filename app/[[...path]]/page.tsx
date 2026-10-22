import Portal from "../portal";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path = [] } = await params;
  return (
    <Portal
      path={"/" + path.join("/")}
      localTest={import.meta.env.DEV && process.env.PORTAL_LOCAL_TEST === "1"}
    />
  );
}
