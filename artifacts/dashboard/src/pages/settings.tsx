import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Settings, Loader2, Save } from "lucide-react";

const schema = z.object({
  favoriteApiUrl: z.string().optional(),
  defaultContextMessages: z.coerce.number().min(1).max(100),
});
type FormValues = z.infer<typeof schema>;

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useGetSettings();
  const update = useUpdateSettings();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { favoriteApiUrl: "", defaultContextMessages: 10 },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        favoriteApiUrl: settings.favoriteApiUrl ?? "",
        defaultContextMessages: settings.defaultContextMessages,
      });
    }
  }, [settings, form]);

  async function onSubmit(values: FormValues) {
    try {
      await update.mutateAsync({ data: { favoriteApiUrl: values.favoriteApiUrl || null, defaultContextMessages: values.defaultContextMessages } });
      qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      toast({ title: "Настройки сохранены" });
    } catch {
      toast({ variant: "destructive", title: "Ошибка сохранения" });
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5 max-w-xl">
      <div>
        <h1 className="text-xl font-bold text-foreground">Настройки</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Глобальные параметры системы</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Settings className="w-4 h-4" /> Основные</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField control={form.control} name="favoriteApiUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>FavoriteAPI URL</FormLabel>
                  <FormControl>
                    <Input placeholder="https://your-server.com" {...field} data-testid="input-favorite-api-url" />
                  </FormControl>
                  <FormDescription>Базовый URL вашего self-hosted Gemini прокси</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="defaultContextMessages" render={({ field }) => (
                <FormItem>
                  <FormLabel>Контекст по умолчанию</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} max={100} {...field} data-testid="input-default-context" />
                  </FormControl>
                  <FormDescription>Сколько предыдущих сообщений передавать агентам</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <Button type="submit" disabled={update.isPending} data-testid="button-save-settings">
                {update.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Сохранение...</> : <><Save className="w-4 h-4 mr-2" /> Сохранить</>}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Теги агентов</CardTitle>
          <CardDescription className="text-xs">Теги, которые ИИ вставляет в ответы</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5 text-xs font-mono">
            {[
              ["[SLEEP:N]", "Пауза N секунд перед ответом"],
              ["[SILENT]", "Не отвечать на этот пост"],
              ["[END_DISCUSSION]", "Завершить обсуждение"],
              ["[REPLY:id]", "Ответить на сообщение с id"],
              ["[CONTEXT:N]", "Запросить N сообщений контекста"],
              ["[MULTI]", "Отправить несколько сообщений"],
              ["[FONT:style]", "Форматирование текста"],
              ["[AGENT:@user]", "Упомянуть другого агента"],
              ["[REACT:emoji]", "Поставить реакцию"],
            ].map(([tag, desc]) => (
              <div key={tag} className="flex gap-3">
                <span className="text-primary w-36 flex-shrink-0">{tag}</span>
                <span className="text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
