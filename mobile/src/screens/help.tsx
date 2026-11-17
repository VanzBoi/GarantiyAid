import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bot, History, Send, Sparkles, UserRound, Headset } from 'lucide-react-native';
import { FadeIn, go, IconCircle, LanguageToggle, Notice, openRoute, styles, Txt } from '../components';
import { peso, useDemo } from '../state';
import {
  formatDate,
  formatDateTime,
  formatClaimStatus,
  formatQueueNumber,
  formatTimeSlot,
} from '../format';
import { colors as c } from '../theme';

type Message = { id: number; role: 'user' | 'assistant'; en: string; bs: string };
const greeting: Message = {
  id: 0,
  role: 'assistant',
  en: 'Hi! I’m GarantiyAid’s assistant. I can help you with your schedule, what to bring, and your claim status. What would you like to know?',
  bs: 'Kumusta! Ako ang assistant sa GarantiyAid. Makatabang ko sa imong iskedyul, dad-on, ug kahimtang sa claim. Unsay gusto nimong mahibal-an?',
};
export function HelpScreen() {
  const { t, overview, overviewLoading, overviewError, wallet, walletError, saveChat } = useDemo();
  const [messages, setMessages] = useState<Message[]>([greeting]);
  const [input, setInput] = useState('');
  const scroll = useRef<ScrollView>(null);
  const questions = [
    {
      en: 'When is my next claim?',
      bs: 'Kanus-a akong sunod nga claim?',
      kind: 'schedule',
    },
    {
      en: 'What is my claim status?',
      bs: 'Unsa ang kahimtang sa akong claim?',
      kind: 'status',
    },
    { en: 'What should I bring?', bs: 'Unsay akong dad-on?', kind: 'bring' },
    { en: 'My face scan failed!', bs: 'Napakyas akong face scan!', kind: 'scan' },
    {
      en: 'How do I enroll my face?',
      bs: 'Unsaon pag-enroll sa nawong?',
      kind: 'enroll',
    },
  ];
  const ask = (en: string, bs: string, kind?: string) => {
    if (!en.trim()) return;
    const query = en.toLowerCase();
    const asksClaimStatus =
      (query.includes('claim') || query.includes('claimed')) &&
      (query.includes('status') ||
        query.includes('kahimtang') ||
        query.includes('completed') ||
        query.includes('claimed') ||
        query.includes('successful') ||
        query.includes('nahuman'));
    const detected =
      kind ||
      (asksClaimStatus
        ? 'status'
        : query.includes('bring') || query.includes('dad-on')
          ? 'bring'
          : query.includes('fail') || query.includes('napakyas')
            ? 'scan'
            : query.includes('enroll')
              ? 'enroll'
              : query.includes('claim') ||
                  query.includes('schedule') ||
                  query.includes('iskedyul')
                ? 'schedule'
                : 'unknown');
    const statusAnswer = (() => {
      if (walletError) {
        return {
          en: 'Your saved claim status is temporarily unavailable. Open Wallet and try loading it again.',
          bs: 'Temporaryong dili makita ang natipig nga kahimtang sa claim. Ablihi ang Wallet ug sulayi pag-load pag-usab.',
        };
      }
      if (!wallet) {
        return {
          en: 'Your saved claim status is still loading. Please ask again in a moment.',
          bs: 'Nag-load pa ang natipig nga kahimtang sa claim. Pangutana pag-usab sa makadiyot.',
        };
      }
      const current = wallet?.currentClaim;
      if (current?.status === 'not_claimed') {
        return {
          en: `Your ${current.program.name} claim scheduled for ${formatDate(current.date)} has not been claimed yet. Authorized staff will record the result after checking your QR pass.`,
          bs: `Wala pa ma-claim ang ${current.program.name} nga naka-iskedyul sa ${formatDate(current.date)}. Ang awtorisadong staff maoy morekord sa resulta human susihon ang QR pass.`,
        };
      }
      if (current) {
        const recordedEn = current.claimedAt
          ? ` It was recorded ${formatDateTime(current.claimedAt)}.`
          : '';
        const recordedBs = current.claimedAt
          ? ` Girekord kini niadtong ${formatDateTime(current.claimedAt)}.`
          : '';
        return {
          en: `Your current ${current.program.name} claim status is ${formatClaimStatus(current.status, en => en, current.deliveryMode)}.${recordedEn}`,
          bs: `Ang kahimtang sa imong kasamtangang ${current.program.name} claim kay ${formatClaimStatus(current.status, (_en, bs) => bs, current.deliveryMode)}.${recordedBs}`,
        };
      }
      const latest = wallet?.claims[0];
      if (latest) {
        const transaction = wallet?.transactions.find((item) => item.claimId === latest.id);
        const receiptEn = latest.receipt ? ` Receipt number: ${latest.receipt.number}.` : transaction
          ? ` Receipt ${transaction.reference} records ${peso(transaction.amount)}.`
          : '';
        const receiptBs = latest.receipt ? ` Numero sa resibo: ${latest.receipt.number}.` : transaction
          ? ` Ang resibo ${transaction.reference} nagrekord og ${peso(transaction.amount)}.`
          : '';
        const recordedEn = latest.claimedAt
          ? ` It was recorded ${formatDateTime(latest.claimedAt)}.`
          : '';
        const recordedBs = latest.claimedAt
          ? ` Girekord kini niadtong ${formatDateTime(latest.claimedAt)}.`
          : '';
        return {
          en: `Your latest ${latest.program.name} claim status is ${formatClaimStatus(latest.status, en => en, latest.deliveryMode)}.${recordedEn}${receiptEn}`,
          bs: `Ang pinakabag-o nimong ${latest.program.name} claim kay ${formatClaimStatus(latest.status, (_en, bs) => bs, latest.deliveryMode)}.${recordedBs}${receiptBs}`,
        };
      }
      return {
        en: 'No claim is recorded for your account yet.',
        bs: 'Wala pay claim nga narekord sa imong account.',
      };
    })();
    const answers: Record<string, { en: string; bs: string }> = {
      status: statusAnswer,
      schedule: overviewError ? {
        en: 'Your saved schedule is temporarily unavailable. Open Home and refresh your schedule.',
        bs: 'Temporaryong dili makita ang natipig nga iskedyul. Ablihi ang Home ug i-refresh ang iskedyul.',
      } : overviewLoading || !overview ? {
        en: 'Your saved schedule is still loading. Please ask again in a moment.',
        bs: 'Nag-load pa ang natipig nga iskedyul. Pangutana pag-usab sa makadiyot.',
      } : overview.nextSchedule
        ? {
            en: `Your next claiming schedule is ${formatDate(overview.nextSchedule.date)} from ${formatTimeSlot(overview.nextSchedule.slotStart, overview.nextSchedule.slotEnd)} at ${overview.nextSchedule.location}. Your queue number is ${formatQueueNumber(overview.nextSchedule.queueNumber)}.`,
            bs: `Ang imong sunod nga iskedyul kay ${formatDate(overview.nextSchedule.date)}, ${formatTimeSlot(overview.nextSchedule.slotStart, overview.nextSchedule.slotEnd)} sa ${overview.nextSchedule.location}. Ang numero sa pila kay ${formatQueueNumber(overview.nextSchedule.queueNumber)}.`,
          }
        : {
            en: 'No claiming schedule is assigned to your account yet. Check Home again later or contact your facilitator.',
            bs: 'Wala pay iskedyul sa claim nga gi-assign sa imong account. Tan-awa pag-usab ang Home o kontaka ang facilitator.',
          },
      bring: {
        en: 'Bring your QR claim pass on your phone and follow the instructions from your assigned facilitator. This preview does not determine official documentary requirements.',
        bs: 'Dad-a ang QR claim pass sa imong cellphone ug sundon ang giingon sa facilitator. Kini nga preview dili motino sa opisyal nga kinahanglanon.',
      },
      scan: {
        en: 'Face scans can fail in poor lighting or if something covers your face. Stay in good lighting and try again. If it keeps failing, ask a staff member at the barangay center for help.',
        bs: 'Mahimong mapakyas ang scan kon ngitngit o natabonan ang nawong. Pabilin sa hayag ug sulayi pag-usab. Kon dili gihapon, pangayo og tabang sa staff sa barangay.',
      },
      enroll: {
        en: 'Open Profile → View face verification → Review consent. Save consent if you agree, then visit your barangay facilitator for face capture. Phone sign-in remains available.',
        bs: 'Ablihi ang Profile → Tan-awa ang face verification → Basaha ang pagtugot. Tipigi ang pagtugot kon mouyon, dayon bisitaha ang barangay facilitator alang sa face capture. Magamit gihapon ang pagsulod gamit ang numero.',
      },
      unknown: {
        en: 'This assistant reads your saved schedule and claim status and offers general guidance. Use Talk to staff to send a concern and check saved staff replies. No external AI is used here.',
        bs: 'Mabasa sa assistant ang natipig nga iskedyul ug kahimtang sa claim ug mohatag og kinatibuk-ang giya. Gamita ang Pakigsulti sa staff aron makapadala og kabalaka ug masusi ang natipig nga tubag. Walay external AI nga gigamit dinhi.',
      },
    };
    const answer = answers[detected];
    // Saved in the language shown, so chat history reads the way the person saw it.
    saveChat?.([
      { role: 'user', text: t(en, bs).trim() },
      { role: 'assistant', text: t(answer.en, answer.bs) },
    ]);
    setMessages((previous) => [
      ...previous,
      { id: previous.length, role: 'user', en: en.trim(), bs: bs.trim() },
      { id: previous.length + 1, role: 'assistant', ...answer },
    ]);
    setInput('');
  };
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: c.surface }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.header}>
          <View style={s.botAvatar}>
            <Bot size={24} color={c.onPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt accessibilityRole="header" variant="label" numberOfLines={1}>
              {t('Assistant', 'Katabang')}
            </Txt>
            <View style={[styles.row, { gap: 6 }]}>
              <Txt variant="small" numberOfLines={2} style={{ fontSize: 12 }}>
                {t('Answers from your saved records', 'Tubag gikan sa imong rekord')}
              </Txt>
            </View>
          </View>
          <LanguageToggle />
        </View>
        <View style={s.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Talk to staff', 'Pakigsulti sa staff')}
            onPress={() => go('support')}
            style={({ pressed }) => [s.action, pressed && { backgroundColor: c.primarySoft }]}
          >
            <Headset size={17} color={c.primary} />
            <Txt variant="label" style={s.actionText}>
              {t('Talk to staff', 'Pakigsulti sa staff')}
            </Txt>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Chat history', 'Kasaysayan sa chat')}
            onPress={() => openRoute('/chat-history')}
            style={({ pressed }) => [s.action, pressed && { backgroundColor: c.primarySoft }]}
          >
            <History size={17} color={c.primary} />
            <Txt variant="label" style={s.actionText}>
              {t('Chat history', 'Kasaysayan sa chat')}
            </Txt>
          </Pressable>
        </View>
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.messages}
          onContentSizeChange={() => { if (messages.length > 1) scroll.current?.scrollToEnd({ animated: true }); }}
        >
          <Notice>
            {t(
              'Schedule and claim answers use your saved account. Other answers are general guidance. Talk to staff for help with your case.',
              'Ang iskedyul ug kahimtang sa claim gikan sa imong account. Kinatibuk-ang giya ang ubang tubag. Pakigsulti sa staff alang sa imong kaso.',
            )}
          </Notice>
          {messages.map((message) => (
            <FadeIn key={message.id} distance={8}>
              <View
                accessible
                accessibilityLabel={`${message.role === 'user' ? t('You', 'Ikaw') : t('Assistant', 'Assistant')}: ${t(message.en, message.bs)}`}
                style={[s.messageRow, message.role === 'user' && { justifyContent: 'flex-end' }]}
              >
                {message.role === 'assistant' && (
                  <IconCircle icon={Sparkles} size={32} tone="primary" />
                )}
                <View style={[s.bubble, message.role === 'user' ? s.userBubble : s.assistantBubble]}>
                  <Txt
                    style={{
                      color: message.role === 'user' ? c.onPrimary : c.text,
                      fontSize: 15,
                      lineHeight: 22,
                    }}
                  >
                    {t(message.en, message.bs)}
                  </Txt>
                </View>
                {message.role === 'user' && <IconCircle icon={UserRound} size={32} tone="neutral" />}
              </View>
            </FadeIn>
          ))}
          {messages.length === 1 && (
            <View style={{ gap: 10 }}>
              <Txt variant="label" style={{ fontSize: 13, color: c.muted }}>
                {t('Suggested questions', 'Gisugyot nga pangutana')}
              </Txt>
              <View style={s.questions}>
                {questions.map((question) => (
                  <Pressable
                    accessibilityRole="button"
                    key={question.kind}
                    onPress={() => ask(question.en, question.bs, question.kind)}
                    style={({ pressed }) => [s.question, pressed && { backgroundColor: c.primarySoft }]}
                  >
                    <Txt variant="label" style={{ color: c.primary, fontSize: 14 }}>
                      {t(question.en, question.bs)}
                    </Txt>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
        <View style={s.composer}>
          <TextInput
            accessibilityLabel={t('Message to the assistant', 'Mensahe sa assistant')}
            value={input}
            onChangeText={setInput}
            placeholder={t('Type a message…', 'Isulat ang mensahe…')}
            placeholderTextColor={c.subtle}
            style={s.input}
            maxLength={500}
            onSubmitEditing={() => ask(input, input)}
            returnKeyType="send"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Send message', 'Ipadala ang mensahe')}
            accessibilityState={{ disabled: !input.trim() }}
            disabled={!input.trim()}
            onPress={() => ask(input, input)}
            style={[s.send, { backgroundColor: input.trim() ? c.primary : c.outline }]}
          >
            <Send size={20} color={input.trim() ? c.onPrimary : c.muted} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: c.card,
  },
  botAvatar: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: c.card,
    borderBottomWidth: 1,
    borderColor: c.outline,
  },
  action: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.primaryTint,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  actionText: { color: c.primary, fontSize: 13, flexShrink: 1 },
  messages: { padding: 20, paddingBottom: 28, gap: 18 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubble: {
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 15,
    maxWidth: '80%',
    flexShrink: 1,
  },
  assistantBubble: {
    backgroundColor: c.card,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: '#EDF1F6',
    boxShadow: '0px 2px 8px rgba(16, 42, 86, 0.06)',
  },
  userBubble: { backgroundColor: c.primary, borderBottomRightRadius: 6 },
  questions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  question: {
    borderWidth: 1,
    borderColor: c.primaryTint,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 48,
    justifyContent: 'center',
    backgroundColor: c.card,
  },
  composer: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: c.outline,
    backgroundColor: c.card,
  },
  input: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 15,
    color: c.text,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.outline,
  },
  send: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
