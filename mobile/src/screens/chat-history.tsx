import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Bot, Headset, MessagesSquare, Trash2 } from 'lucide-react-native';
import {
  Button,
  Card,
  ConfirmationModal,
  EmptyState,
  Field,
  go,
  LoadingSkeleton,
  Notice,
  Page,
  SectionHeader,
  Txt,
} from '../components';
import { ApiRequestError, clearAssistantMessages, getAssistantMessages, isUnavailableOnServer, type AssistantMessage } from '../api';
import { useDemo } from '../state';
import { formatDateTime } from '../format';
import { colors as c } from '../theme';

/** Groups saved messages into conversations separated by at least 30 minutes of inactivity. */
export function groupConversations(messages: AssistantMessage[]) {
  const groups: AssistantMessage[][] = [];
  for (const message of messages) {
    const last = groups.at(-1)?.at(-1);
    if (!last || Date.parse(message.createdAt) - Date.parse(last.createdAt) > 30 * 60 * 1000) groups.push([message]);
    else groups.at(-1)!.push(message);
  }
  return groups.reverse();
}

export function ChatHistoryScreen() {
  const { accessToken, reset, t } = useDemo();
  const [messages, setMessages] = useState<AssistantMessage[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'unavailable'>('loading');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const request = useRef(0);
  const load = async () => {
    if (!accessToken) return;
    const id = ++request.current;
    setState('loading');
    try {
      const next = await getAssistantMessages(accessToken);
      if (id !== request.current) return;
      setMessages(next);
      setState('ready');
    } catch (cause) {
      if (id !== request.current) return;
      if (cause instanceof ApiRequestError && cause.status === 401) { await reset(); router.replace('/'); return; }
      setState(isUnavailableOnServer(cause) ? 'unavailable' : 'error');
    }
  };
  useEffect(() => { void load(); return () => { request.current++; }; }, [accessToken]);
  const search = query.trim().toLocaleLowerCase();
  const conversations = groupConversations(messages ?? []).filter((group) =>
    !search || group.some((message) => message.text.toLocaleLowerCase().includes(search)));
  return (
    <Page title={t('Chat history', 'Kasaysayan sa chat')}>
      {state === 'loading' && <LoadingSkeleton label={t('Loading your conversations…', 'Nag-load sa imong mga panag-istorya…')} />}
      {state === 'error' && (
        <>
          <Notice tone="error">{t('Your chat history could not be loaded.', 'Wala ma-load ang kasaysayan sa chat.')}</Notice>
          <Button onPress={() => void load()}>{t('Try again', 'Sulayi pag-usab')}</Button>
        </>
      )}
      {state === 'unavailable' && (
        <Notice>{t('The connected server does not save assistant conversations. Your staff conversations are still saved.', 'Wala gitipigi sa konektado nga server ang panag-istorya sa assistant. Natipig gihapon ang panag-istorya sa staff.')}</Notice>
      )}
      {state === 'ready' && (
        <>
          {(messages?.length ?? 0) > 0 && (
            <Field label={t('Search conversations', 'Pangitaa ang panag-istorya')} value={query} onChangeText={setQuery}
              placeholder={t('For example: schedule', 'Pananglitan: iskedyul')} />
          )}
          {conversations.length === 0 ? (
            <EmptyState icon={MessagesSquare}
              title={messages?.length ? t('No matching conversations', 'Walay katugbang nga panag-istorya') : t('No saved conversations yet', 'Wala pay natipig nga panag-istorya')}
              body={t('Questions you ask the assistant are saved here.', 'Ang imong mga pangutana sa assistant matipig dinhi.')}>
              <Button icon={Bot} onPress={() => router.navigate('/(tabs)/help')}>{t('Ask the assistant', 'Pangutana sa assistant')}</Button>
            </EmptyState>
          ) : conversations.map((group, index) => {
            const first = group.find((message) => message.role === 'user') ?? group[0];
            const expanded = open === index;
            return (
              <Card key={group[0].id} style={{ gap: 10 }}>
                <View style={{ gap: 4 }}>
                  <Txt variant="label" numberOfLines={expanded ? undefined : 2}>{first.text}</Txt>
                  <Txt variant="small">{formatDateTime(group[0].createdAt)} · {t(`${group.length} messages`, `${group.length} ka mensahe`)}</Txt>
                </View>
                {expanded && group.map((message) => (
                  <View key={message.id} style={{ alignItems: message.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <View style={{ maxWidth: '88%', borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14,
                      backgroundColor: message.role === 'user' ? c.primary : c.surface, borderWidth: message.role === 'user' ? 0 : 1, borderColor: c.outline }}>
                      <Txt selectable style={{ color: message.role === 'user' ? c.onPrimary : c.text }}>{message.text}</Txt>
                    </View>
                  </View>
                ))}
                <Button variant="ghost" onPress={() => setOpen(expanded ? null : index)}>
                  {expanded ? t('Hide conversation', 'Itago ang panag-istorya') : t('View conversation', 'Tan-awa ang panag-istorya')}
                </Button>
              </Card>
            );
          })}
          {(messages?.length ?? 0) > 0 && (
            <Button variant="outline" icon={Trash2} onPress={() => setConfirmClear(true)}>{t('Clear assistant history', 'Papasa ang kasaysayan sa assistant')}</Button>
          )}
        </>
      )}
      <SectionHeader title={t('Staff conversations', 'Panag-istorya sa staff')} />
      <Button variant="outline" icon={Headset} onPress={() => go('support')}>{t('Open requests sent to staff', 'Ablihi ang mga request sa staff')}</Button>
      <ConfirmationModal
        visible={confirmClear}
        danger
        title={t('Clear assistant history?', 'Papason ang kasaysayan?')}
        message={t('This deletes your saved assistant conversations. Staff requests are not affected.', 'Mapapas ang natipig nga panag-istorya sa assistant. Dili maapil ang mga request sa staff.')}
        cancelLabel={t('Cancel', 'Kanselahon')}
        confirmLabel={t('Clear', 'Papasa')}
        loading={clearing}
        onCancel={() => setConfirmClear(false)}
        onConfirm={async () => {
          setClearing(true);
          try { await clearAssistantMessages(accessToken); setMessages([]); setConfirmClear(false); }
          catch { setConfirmClear(false); setState('error'); }
          finally { setClearing(false); }
        }}
      />
    </Page>
  );
}
