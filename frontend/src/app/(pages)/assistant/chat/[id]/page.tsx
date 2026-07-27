import { redirect } from "next/navigation";

export default async function AssistantChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/lawyering/chat/${id}`);
}
