import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { ApiRequestError, askAssistant, isUnavailableOnServer } from '../api';
import {
  formatDate,
  formatDateTime,
  formatClaimStatus,
  formatQueueNumber,
  formatTimeSlot,
} from '../format';
import { colors as c } from '../theme';

type Message = { id: number; role: 'user' | 'assistant'; en: string; bs: string; failed?: boolean };
const greeting: Message = {
  id: 0,
  role: 'assistant',
  en: 'Hi! I’m the GarantiyAid assistant. Ask me anything in English or Bisaya: your schedule, claim status, DSWD programs, requirements, or how to use the app.',
  bs: 'Kumusta! Ako ang assistant sa GarantiyAid. Pangutana bisan unsa sa Bisaya o English: imong iskedyul, kahimtang sa claim, mga programa sa DSWD, requirements, o unsaon paggamit sa app.',
};
export function HelpScreen() {
  const { t, language, accessToken, overview, overviewLoading, overviewError, wallet, walletError, saveChat } = useDemo();
  const [messages, setMessages] = useState<Message[]>([greeting]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  // Set when the server has no AI assistant; answers then come from saved records and fixed guidance only.
  const [aiOff, setAiOff] = useState(false);
  const busy = useRef(false);
  const nextId = useRef(1);
  const scroll = useRef<ScrollView>(null);
  const questions = [
    { en: 'When is my next claim?', bs: 'Kanus-a akong sunod nga claim?', kind: 'schedule' },
    { en: 'What is my claim status?', bs: 'Unsa ang kahimtang sa akong claim?', kind: 'status' },
    { en: 'What should I bring?', bs: 'Unsay akong dad-on?', kind: 'bring' },
    { en: 'What is 4Ps and who can join?', bs: 'Unsa ang 4Ps ug kinsa ang pwede?', kind: 'program' },
    { en: 'My face scan failed!', bs: 'Napakyas akong face scan!', kind: 'scan' },
    { en: 'How do I reset my password?', bs: 'Unsaon pag-reset sa akong password?', kind: 'password' },
  ];
  const id = () => nextId.current++;

  /** Answers from saved records and fixed guidance, used when the AI assistant is not available. */
  const scriptedAnswer = (en: string, kind?: string): { en: string; bs: string } => {
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
              : query.includes('password')
                ? 'password'
                : query.includes('4ps') || query.includes('program')
                  ? 'program'
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
        const recordedEn = current.claimedAt ? ` It was recorded ${formatDateTime(current.claimedAt)}.` : '';
        const recordedBs = current.claimedAt ? ` Girekord kini niadtong ${formatDateTime(current.claimedAt)}.` : '';
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
        const recordedEn = latest.claimedAt ? ` It was recorded ${formatDateTime(latest.claimedAt)}.` : '';
        const recordedBs = latest.claimedAt ? ` Girekord kini niadtong ${formatDateTime(latest.claimedAt)}.` : '';
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
      program: {
        en: 'Home and My programs show the programs saved on your account. To find out who can join a DSWD program like 4Ps, ask your barangay or city social welfare office, or use Talk to staff.',
        bs: 'Makita sa Home ug Akong programa ang mga programa nga natipig sa imong account. Aron mahibal-an kinsa ang pwede sa programa sa DSWD sama sa 4Ps, pangutana sa barangay o social welfare office sa siyudad, o gamita ang Pakigsulti sa staff.',
      },
      password: {
        en: 'On the Log in screen, tap Forgot password. Enter your number, the code we send, and a new password. If you are logged in, use Profile › Change password.',
        bs: 'Sa Log in nga screen, i-tap ang Nakalimot sa password. Isulod ang imong numero, ang code nga among ipadala, ug bag-ong password. Kon naka-log in ka, gamita ang Profile › Usba ang password.',
      },
      unknown: {
        en: 'The AI assistant is not available right now, so I can only answer questions about your schedule, claim status, what to bring, passwords and face scans. For other questions, use Talk to staff.',
        bs: 'Dili magamit ang AI assistant karon, mao nga ang matubag ra nako kay bahin sa imong iskedyul, kahimtang sa claim, dad-on, password ug face scan. Sa ubang pangutana, gamita ang Pakigsulti sa staff.',
      },
    };
    return answers[detected];
  };

  const ask = async (en: string, bs: string, kind?: string) => {
    const shown = t(en, bs).trim();
    if (!shown || busy.current) return;
    const question: Message = { id: id(), role: 'user', en: en.trim(), bs: bs.trim() };
    setInput('');
    if (!accessToken || aiOff) {
      const answer = scriptedAnswer(en, kind);
      // Saved in the language shown, so chat history reads the way the person saw it.
      saveChat?.([{ role: 'user', text: shown }, { role: 'assistant', text: t(answer.en, answer.bs) }]);
      setMessages((previous) => [...previous, question, { id: id(), role: 'assistant', ...answer }]);
      return;
    }
    busy.current = true;
    setThinking(true);
    const history = [...messages.slice(1), question]
      .filter((message) => !message.failed)
      .slice(-20)
      .map((message) => ({ role: message.role, text: t(message.en, message.bs) }));
    setMessages((previous) => [...previous, question]);
    try {
      const { text } = await askAssistant(accessToken, history, language);
      saveChat?.([{ role: 'user', text: shown }, { role: 'assistant', text }]);
      setMessages((previous) => [...previous, { id: id(), role: 'assistant', en: text, bs: text }]);
    } catch (error) {
      if (isUnavailableOnServer(error) || (error instanceof ApiRequestError && error.code === 'ASSISTANT_UNAVAILABLE')) {
        setAiOff(true);
        const answer = scriptedAnswer(en, kind);
        setMessages((previous) => [...previous, { id: id(), role: 'assistant', ...answer }]);
      } else {
        const reply = error instanceof ApiRequestError && error.code === 'ASSISTANT_BUSY'
          ? { en: 'Many questions were sent in a short time. Please wait a few minutes and try again.', bs: 'Daghan kaayo ang pangutana sa mubo nga panahon. Paghulat og pipila ka minuto ug sulayi pag-usab.' }
          : { en: 'I could not answer right now. Check your internet connection and try again.', bs: 'Dili ko makatubag karon. Susiha ang imong internet ug sulayi pag-usab.' };
        setMessages((previous) => [...previous, { id: id(), role: 'assistant', ...reply, failed: true }]);
      }
    } finally {
      busy.current = false;
      setThinking(false);
    }
  };

  const canSend = !!input.trim() && !thinking;
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
              <View style={[s.statusDot, aiOff && { backgroundColor: c.subtle }]} />
              <Txt variant="small" numberOfLines={2} style={{ fontSize: 12, flex: 1 }}>
                {aiOff || !accessToken
                  ? t('Basic answers from your records', 'Batakang tubag gikan sa imong rekord')
                  : t('AI assistant · English or Bisaya', 'AI assistant · Bisaya o English')}
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
            {aiOff || !accessToken
              ? t(
                  'Schedule and claim answers use your saved account. Other answers are general guidance. Talk to staff for help with your case.',
                  'Ang iskedyul ug kahimtang sa claim gikan sa imong account. Kinatibuk-ang giya ang ubang tubag. Pakigsulti sa staff alang sa imong kaso.',
                )
              : t(
                  'Answers use your saved records. AI can make mistakes. Staff decide on programs, eligibility and claims. Never share your password or codes.',
                  'Ang tubag gibase sa imong rekord. Mahimong masayop ang AI. Ang staff ang modesisyon sa programa, eligibility ug claim. Ayaw ipaambit ang password o code.',
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
                  <IconCircle icon={Sparkles} size={32} tone={message.failed ? 'amber' : 'primary'} />
                )}
                <View style={[s.bubble, message.role === 'user' ? s.userBubble : s.assistantBubble, message.failed && s.failedBubble]}>
                  <Txt
                    selectable
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
          {thinking && (
            <View accessibilityLiveRegion="polite" style={s.messageRow}>
              <IconCircle icon={Sparkles} size={32} tone="primary" />
              <View style={[s.bubble, s.assistantBubble, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                <ActivityIndicator size="small" color={c.primary} />
                <Txt variant="small" style={{ color: c.muted }}>{t('Thinking…', 'Naghunahuna…')}</Txt>
              </View>
            </View>
          )}
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
            placeholder={t('Ask anything…', 'Pangutana bisan unsa…')}
            placeholderTextColor={c.subtle}
            style={s.input}
            maxLength={1000}
            multiline
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Send message', 'Ipadala ang mensahe')}
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={() => ask(input, input)}
            style={[s.send, { backgroundColor: canSend ? c.primary : c.outline }]}
          >
            <Send size={20} color={canSend ? c.onPrimary : c.muted} />
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
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.green },
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
  failedBubble: { backgroundColor: c.amberSoft, borderColor: '#F3E3B5' },
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
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderColor: c.outline,
    backgroundColor: c.card,
  },
  input: {
    flex: 1,
    minHeight: 50,
    maxHeight: 130,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 13,
    fontSize: 15,
    color: c.text,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.outline,
    textAlignVertical: 'top',
  },
  send: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
