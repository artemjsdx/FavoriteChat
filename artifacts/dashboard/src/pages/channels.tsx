import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListChannels, useCreateChannel, useDeleteChannel, useUpdateChannel,
  useListAgents, useListChannelAgents, useBindChannelAgent, useUnbindChannelAgent,
  getListChannelsQueryKey,
} from "@workspace/api-client-react";
import type { Channel } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Hash, Plus, Trash2, Bot, X, ChevronRight } from "lucide-react";

const channelSchema = z.object({
  telegramChatId: z.string().min(1, "Введите ID чата"),
  linkedGroupId: z.string().optional(),
  title: z.string().min(1, "Введите название"),
  type: z.enum(["channel", "group", "supergroup"]),
  contextMessages: z.coerce.number().min(1).max(100).default(10),
});
type ChannelForm = z.infer<typeof channelSchema>;

function ManageAgentsDialog({ channel }: { channel: Channel }) {
  const [open, setOpen] = useState(false);
  const { data: allAgents } = useListAgents();
  const { data: channelAgents, refetch } = useListChannelAgents(channel.id, {
    query: { enabled: open },
  });
  const bind = useBindChannelAgent();
  const unbind = useUnbindChannelAgent();
  const { toast } = useToast();

  const boundIds = new Set(channelAgents?.map((a) => a.id) ?? []);
  const unbound = allAgents?.filter((a) => !boundIds.has(a.id)) ?? [];

  async function add(agentId: number) {
    await bind.mutateAsync({ id: channel.id, data: { agentId } });
    refetch();
    toast({ title: "Агент добавлен" });
  }

  async function remove(agentId: number) {
    await unbind.mutateAsync({ id: channel.id, agentId });
    refetch();
    toast({ title: "Агент удалён" });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs gap-1" data-testid={`button-manage-agents-${channel.id}`}>
          <Bot className="w-3.5 h-3.5" /> {channel.agentCount ?? 0} агентов <ChevronRight className="w-3 h-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Агенты: {channel.title}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {channelAgents?.length ? (
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-2">Привязаны</p>
              <div className="space-y-1.5">
                {channelAgents.map((a) => (
                  <div key={a.id} className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-1.5">
                    <span className="text-sm">@{a.botUsername}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => remove(a.id)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Нет привязанных агентов</p>
          )}

          {unbound.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-2">Добавить</p>
              <div className="space-y-1.5">
                {unbound.map((a) => (
                  <div key={a.id} className="flex items-center justify-between bg-muted/30 rounded-md px-3 py-1.5">
                    <span className="text-sm">@{a.botUsername}</span>
                    <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => add(a.id)}>+</Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateChannelDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const create = useCreateChannel();

  const form = useForm<ChannelForm>({
    resolver: zodResolver(channelSchema),
    defaultValues: { telegramChatId: "", linkedGroupId: "", title: "", type: "channel", contextMessages: 10 },
  });

  async function onSubmit(values: ChannelForm) {
    try {
      await create.mutateAsync({
        data: { ...values, linkedGroupId: values.linkedGroupId || null },
      });
      toast({ title: "Канал добавлен!" });
      onCreated();
      setOpen(false);
      form.reset();
    } catch {
      toast({ variant: "destructive", title: "Ошибка добавления канала" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-create-channel"><Plus className="w-4 h-4 mr-1.5" /> Добавить канал</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Добавить канал</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem>
                <FormLabel>Название</FormLabel>
                <FormControl><Input placeholder="Мой канал" {...field} data-testid="input-channel-title" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="telegramChatId" render={({ field }) => (
              <FormItem>
                <FormLabel>ID канала</FormLabel>
                <FormControl><Input placeholder="-100123456789" {...field} data-testid="input-chat-id" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="linkedGroupId" render={({ field }) => (
              <FormItem>
                <FormLabel>ID группы комментариев (необязательно)</FormLabel>
                <FormControl><Input placeholder="-100987654321" {...field} data-testid="input-linked-group-id" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="type" render={({ field }) => (
              <FormItem>
                <FormLabel>Тип</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger data-testid="select-channel-type"><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="channel">Канал</SelectItem>
                    <SelectItem value="group">Группа</SelectItem>
                    <SelectItem value="supergroup">Супергруппа</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="contextMessages" render={({ field }) => (
              <FormItem>
                <FormLabel>Контекст (сообщений)</FormLabel>
                <FormControl><Input type="number" min={1} max={100} {...field} data-testid="input-context-messages" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <Button type="submit" className="w-full" disabled={create.isPending} data-testid="button-submit-channel">
              Добавить
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function ChannelsPage() {
  const qc = useQueryClient();
  const { data: channels, isLoading } = useListChannels();
  const deleteChannel = useDeleteChannel();
  const updateChannel = useUpdateChannel();
  const { toast } = useToast();

  function refetch() { qc.invalidateQueries({ queryKey: getListChannelsQueryKey() }); }

  async function handleDelete(id: number) {
    await deleteChannel.mutateAsync({ id });
    toast({ title: "Канал удалён" });
    refetch();
  }

  async function handleToggle(id: number, active: boolean) {
    await updateChannel.mutateAsync({ id, data: { active } });
    refetch();
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Каналы</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Telegram каналы и группы</p>
        </div>
        <CreateChannelDialog onCreated={refetch} />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : !channels?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 gap-3">
            <Hash className="w-10 h-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Нет каналов. Добавьте первый!</p>
            <CreateChannelDialog onCreated={refetch} />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {channels.map((ch) => (
            <Card key={ch.id} data-testid={`card-channel-${ch.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-chart-2/10 flex items-center justify-center flex-shrink-0">
                      <Hash className="w-4 h-4 text-chart-2" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{ch.title}</p>
                      <p className="text-xs text-muted-foreground">{ch.telegramChatId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Switch
                      checked={ch.active}
                      onCheckedChange={(v) => handleToggle(ch.id, v)}
                      data-testid={`switch-channel-${ch.id}`}
                    />
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                      onClick={() => handleDelete(ch.id)}
                      data-testid={`button-delete-channel-${ch.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2.5">
                  <Badge variant="secondary" className="text-xs">{ch.type}</Badge>
                  {ch.linkedGroupId && <Badge variant="outline" className="text-xs">linked</Badge>}
                  <Badge variant="outline" className="text-xs">ctx: {ch.contextMessages}</Badge>
                  <ManageAgentsDialog channel={ch} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
