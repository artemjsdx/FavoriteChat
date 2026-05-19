import { Bot, Hash, MessageSquare, Zap, TrendingUp } from "lucide-react";
import { useGetDashboardStats, useGetActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

function StatCard({ title, value, icon: Icon, color }: { title: string; value?: number; icon: React.ElementType; color: string }) {
  return (
    <Card data-testid={`card-stat-${title}`}>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium">{title}</p>
          {value === undefined ? (
            <Skeleton className="h-7 w-12 mt-1" />
          ) : (
            <p className="text-2xl font-bold text-foreground">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: activity, isLoading: actLoading } = useGetActivity({ limit: 10 });

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Обзор</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Статус системы FavoriteChat</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Агенты" value={statsLoading ? undefined : stats?.totalAgents} icon={Bot} color="bg-primary/10 text-primary" />
        <StatCard title="Каналы" value={statsLoading ? undefined : stats?.totalChannels} icon={Hash} color="bg-chart-2/10 text-chart-2" />
        <StatCard title="Сообщений сегодня" value={statsLoading ? undefined : stats?.messagesToday} icon={MessageSquare} color="bg-chart-3/10 text-chart-3" />
        <StatCard title="Активных агентов" value={statsLoading ? undefined : stats?.activeAgents} icon={Zap} color="bg-chart-4/10 text-chart-4" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Последние сообщения агентов
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {actLoading ? (
            <div className="space-y-3 p-4">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !activity?.length ? (
            <p className="text-center text-muted-foreground text-sm py-10">Нет активности. Добавьте агентов и каналы.</p>
          ) : (
            <div className="divide-y divide-border">
              {activity.map((item) => (
                <div key={item.id} data-testid={`row-activity-${item.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-foreground">@{item.agentUsername}</span>
                      <span className="text-xs text-muted-foreground">в</span>
                      <Badge variant="secondary" className="text-xs py-0 px-1.5 h-4">{item.channelTitle}</Badge>
                      {item.isReply && <Badge variant="outline" className="text-xs py-0 px-1.5 h-4">reply</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.text}</p>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: ru })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
