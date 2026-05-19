import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListAgents, useCreateAgent, useDeleteAgent, useUpdateAgent,
  useValidateBotToken, useValidateApiKey,
  getListAgentsQueryKey,
} from "@workspace/api-client-react";
import type { Agent } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Bot, Plus, Trash2, CheckCircle, XCircle, Loader2 } from "lucide-react";

const FAVORITE_MODELS = [
  { id: "gemini-3.0-flash-thinking", name: "Gemini 3.0 Flash Thinking (DEFAULT)" },
  { id: "gemini-3.0-flash", name: "Gemini 3.0 Flash (быстрее)" },
  { id: "gemini-2.5-flash-thinking", name: "Gemini 2.5 Flash Thinking" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-mini-thinking", name: "Gemini 2.5 Mini Thinking" },
  { id: "gemini-2.5-mini", name: "Gemini 2.5 Mini" },
  { id: "gemini-1.5-robotics-er-preview", name: "Gemini 1.5 Robotics Preview" },
  { id: "gemini-3.0-flash-thinking-64k", name: "Gemini 3.0 Flash Thinking 64k" },
  { id: "gemini-3.0-flash-64k", name: "Gemini 3.0 Flash 64k" },
  { id: "gemini-2.5-flash-thinking-64k", name: "Gemini 2.5 Flash Thinking 64k" },
  { id: "gemini-2.5-flash-64k", name: "Gemini 2.5 Flash 64k" },
];

const formSchema = z.object({
  botToken: z.string().min(20, "Введите токен бота"),
  apiType: z.enum(["openrouter", "favorite"]),
  apiKey: z.string().min(1, "Введите API ключ"),
  apiUrl: z.string().optional(),
  model: z.string().min(1, "Выберите модель"),
  userPrompt: z.string().optional(),
  responseChance: z.coerce.number().min(0).max(100).default(80),
  minDelaySec: z.coerce.number().min(0).default(2),
  maxDelaySec: z.coerce.number().min(0).default(10),
});

type FormValues = z.infer<typeof formSchema>;

function AgentCard({ agent, onDelete, onToggle }: {
  agent: Agent;
  onDelete: (id: number) => void;
  onToggle: (id: number, active: boolean) => void;
}) {
  const apiColors: Record<string, string> = {
    openrouter: "bg-purple-500/10 text-purple-400",
    favorite: "bg-blue-500/10 text-blue-400",
  };

  return (
    <Card data-testid={`card-agent-${agent.id}`} className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{agent.name}</p>
              <p className="text-xs text-muted-foreground">@{agent.botUsername}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Switch
              checked={agent.active}
              onCheckedChange={(v) => onToggle(agent.id, v)}
              data-testid={`switch-agent-${agent.id}`}
            />
            <Button
              variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => onDelete(agent.id)}
              data-testid={`button-delete-agent-${agent.id}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <Badge className={`text-xs ${apiColors[agent.apiType] ?? ""}`}>{agent.apiType}</Badge>
          <Badge variant="outline" className="text-xs">{agent.model}</Badge>
          <Badge variant="secondary" className="text-xs">{agent.responseChance}% шанс</Badge>
          {agent.webhookRegistered && <Badge variant="secondary" className="text-xs text-green-500">webhook ✓</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}

function CreateAgentDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [tokenOk, setTokenOk] = useState<boolean | null>(null);
  const [keyOk, setKeyOk] = useState<boolean | null>(null);
  const { toast } = useToast();
  const validateToken = useValidateBotToken();
  const validateKey = useValidateApiKey();
  const create = useCreateAgent();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      botToken: "", apiType: "favorite", apiKey: "", apiUrl: "",
      model: "gemini-3.0-flash-thinking", userPrompt: "",
      responseChance: 80, minDelaySec: 2, maxDelaySec: 10,
    },
  });

  const apiType = form.watch("apiType");

  async function checkToken() {
    const token = form.getValues("botToken");
    if (!token) return;
    const r = await validateToken.mutateAsync({ data: { token } });
    setTokenOk(r.valid);
    if (r.valid && r.firstName) toast({ title: `Бот: ${r.firstName} (@${r.username})` });
    else toast({ variant: "destructive", title: r.error ?? "Неверный токен" });
  }

  async function checkKey() {
    const { apiKey, apiUrl, apiType: at } = form.getValues();
    if (!apiKey) return;
    const r = await validateKey.mutateAsync({ data: { apiType: at, apiKey, apiUrl: apiUrl || null } });
    setKeyOk(r.valid);
    if (r.valid) toast({ title: "Ключ действителен", description: r.defaultModel ?? undefined });
    else toast({ variant: "destructive", title: r.error ?? "Неверный ключ" });
  }

  async function onSubmit(values: FormValues) {
    try {
      await create.mutateAsync({
        data: {
          ...values,
          apiUrl: values.apiUrl || null,
          userPrompt: values.userPrompt || null,
        },
      });
      toast({ title: "Агент создан!" });
      onCreated();
      setOpen(false);
      form.reset();
      setTokenOk(null);
      setKeyOk(null);
    } catch {
      toast({ variant: "destructive", title: "Ошибка создания агента" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-create-agent"><Plus className="w-4 h-4 mr-1.5" /> Добавить агента</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Новый агент</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="botToken" render={({ field }) => (
              <FormItem>
                <FormLabel>Токен бота</FormLabel>
                <div className="flex gap-2">
                  <FormControl><Input placeholder="1234567890:AAF..." {...field} data-testid="input-bot-token" /></FormControl>
                  <Button type="button" variant="outline" size="sm" onClick={checkToken} disabled={validateToken.isPending} className="flex-shrink-0">
                    {validateToken.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> :
                      tokenOk === true ? <CheckCircle className="w-4 h-4 text-green-500" /> :
                      tokenOk === false ? <XCircle className="w-4 h-4 text-destructive" /> : "Проверить"}
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="apiType" render={({ field }) => (
              <FormItem>
                <FormLabel>Тип API</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger data-testid="select-api-type"><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="favorite">FavoriteAPI (Gemini)</SelectItem>
                    <SelectItem value="openrouter">OpenRouter</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            {apiType === "favorite" && (
              <FormField control={form.control} name="apiUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>URL FavoriteAPI</FormLabel>
                  <FormControl><Input placeholder="https://..." {...field} data-testid="input-api-url" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            <FormField control={form.control} name="apiKey" render={({ field }) => (
              <FormItem>
                <FormLabel>API ключ</FormLabel>
                <div className="flex gap-2">
                  <FormControl>
                    <Input
                      placeholder={apiType === "favorite" ? "fa_sk_..." : "sk-or-..."}
                      type="password" {...field} data-testid="input-api-key"
                    />
                  </FormControl>
                  <Button type="button" variant="outline" size="sm" onClick={checkKey} disabled={validateKey.isPending} className="flex-shrink-0">
                    {validateKey.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> :
                      keyOk === true ? <CheckCircle className="w-4 h-4 text-green-500" /> :
                      keyOk === false ? <XCircle className="w-4 h-4 text-destructive" /> : "Проверить"}
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="model" render={({ field }) => (
              <FormItem>
                <FormLabel>Модель</FormLabel>
                {apiType === "favorite" ? (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger data-testid="select-model"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {FAVORITE_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <FormControl><Input placeholder="google/gemma-3-27b-it:free" {...field} data-testid="input-model" /></FormControl>
                )}
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="userPrompt" render={({ field }) => (
              <FormItem>
                <FormLabel>Системный промпт (необязательно)</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="Ты — живой участник чата..." {...field} data-testid="textarea-prompt" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-3 gap-3">
              <FormField control={form.control} name="responseChance" render={({ field }) => (
                <FormItem>
                  <FormLabel>Шанс %</FormLabel>
                  <FormControl><Input type="number" min={0} max={100} {...field} data-testid="input-response-chance" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="minDelaySec" render={({ field }) => (
                <FormItem>
                  <FormLabel>Мин. сек</FormLabel>
                  <FormControl><Input type="number" min={0} {...field} data-testid="input-min-delay" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="maxDelaySec" render={({ field }) => (
                <FormItem>
                  <FormLabel>Макс. сек</FormLabel>
                  <FormControl><Input type="number" min={0} {...field} data-testid="input-max-delay" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <Button type="submit" className="w-full" disabled={create.isPending} data-testid="button-submit-agent">
              {create.isPending
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Создание...</>
                : "Создать агента"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function AgentsPage() {
  const qc = useQueryClient();
  const { data: agents, isLoading } = useListAgents();
  const deleteAgent = useDeleteAgent();
  const updateAgent = useUpdateAgent();
  const { toast } = useToast();

  function refetch() { qc.invalidateQueries({ queryKey: getListAgentsQueryKey() }); }

  async function handleDelete(id: number) {
    await deleteAgent.mutateAsync({ id });
    toast({ title: "Агент удалён" });
    refetch();
  }

  async function handleToggle(id: number, active: boolean) {
    await updateAgent.mutateAsync({ id, data: { active } });
    refetch();
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Агенты</h1>
          <p className="text-sm text-muted-foreground mt-0.5">ИИ-боты для обсуждения постов</p>
        </div>
        <CreateAgentDialog onCreated={refetch} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : !agents?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 gap-3">
            <Bot className="w-10 h-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Нет агентов. Добавьте первого!</p>
            <CreateAgentDialog onCreated={refetch} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((a) => (
            <AgentCard key={a.id} agent={a} onDelete={handleDelete} onToggle={handleToggle} />
          ))}
        </div>
      )}
    </div>
  );
}
