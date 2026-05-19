import { useState } from "react";
import { useGetActivity, useListAgents, useListChannels, getGetActivityQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

export default function ActivityPage() {
  const [agentId, setAgentId] = useState<number | null>(null);
  const [channelId, setChannelId] = useState<number | null>(null);

  const { data: agents } = useListAgents();
  const { data: channels } = useListChannels();
  const { data: activity, isLoading } = useGetActivity(
    { limit: 50, agentId: agentId ?? undefined, channelId: channelId ?? undefined },
    { query: { queryKey: getGetActivityQueryKey({ limit: 50, agentId: agentId ?? undefined, channelId: channelId ?? undefined }) } }
  );

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Активность</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Лента сообщений агентов</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select onValueChange={(v) => setAgentId(v === "all" ? null : parseInt(v))}>
          <SelectTrigger className="w-48" data-testid="select-filter-agent">
            <SelectValue placeholder="Все агенты" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все агенты</SelectItem>
            {agents?.map((a) => <SelectItem key={a.id} value={String(a.id)}>@{a.botUsername}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select onValueChange={(v) => setChannelId(v === "all" ? null : parseInt(v))}>
          <SelectTrigger className="w-48" data-testid="select-filter-channel">
            <SelectValue placeholder="Все каналы" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все каналы</SelectItem>
            {channels?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : !activity?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 gap-3">
            <MessageSquare className="w-10 h-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Нет сообщений</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {activity.map((item) => (
            <Card key={item.id} data-testid={`card-activity-${item.id}`} className="hover:shadow-sm transition-shadow">
              <CardContent className="flex items-start gap-3 p-3.5">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-semibold text-foreground">@{item.agentUsername}</span>
                    <Badge variant="secondary" className="text-xs py-0 px-1.5 h-4">{item.channelTitle}</Badge>
                    {item.isReply && <Badge variant="outline" className="text-xs py-0 px-1.5 h-4">↩ reply</Badge>}
                  </div>
                  <p className="text-sm text-foreground/90 break-words">{item.text}</p>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0 mt-0.5">
                  {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: ru })}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
