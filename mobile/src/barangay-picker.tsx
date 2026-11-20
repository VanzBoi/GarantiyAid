import React, { useMemo, useState } from 'react';
import { FlatList, Keyboard, Modal, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, ChevronDown, ChevronRight, MapPin, Search, X } from 'lucide-react-native';
import type { Barangay } from './api';
import { styles, Txt } from './components';
import { useDemo } from './state';
import { colors as c, fonts } from './theme';

type Step = 0 | 1 | 2;
type Item =
  | { kind: 'option'; key: string; label: string; detail?: string; letter?: string; selected: boolean; onPress: () => void }
  | { kind: 'heading'; key: string; label: string };

const fold = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase().trim();
const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
const unique = (values: string[]) => [...new Set(values)].sort(byName);
const initial = (text: string) => fold(text).charAt(0).toLocaleUpperCase();

/**
 * Address picker modelled on courier apps: choose Province, then City or
 * municipality, then Barangay, with search at every level. Searching from the
 * Province step also lists matching barangays so people can jump straight there.
 */
export function BarangayPicker({ label, areas, value, onChange, error, disabled }: {
  label: string;
  areas: Barangay[];
  value: string;
  onChange: (id: string) => void;
  error?: string;
  disabled?: boolean;
  /** Kept for existing callers; the city and province are always shown. */
  showCity?: boolean;
}) {
  const { t } = useDemo();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(0);
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [search, setSearch] = useState('');
  const selected = areas.find((area) => area.id === value);
  const unavailable = disabled || !areas.length;
  const prompt = t('Province, city, barangay', 'Probinsya, siyudad, barangay');
  const stepLabels = [t('Province', 'Probinsya'), t('City / Municipality', 'Siyudad / Lungsod'), t('Barangay', 'Barangay')];
  const provinces = useMemo(() => unique(areas.map((area) => area.province)), [areas]);

  const goTo = (next: Step) => { setSearch(''); setStep(next); };
  const show = () => {
    Keyboard.dismiss();
    setSearch('');
    if (selected) {
      setProvince(selected.province);
      setCity(selected.city);
      setStep(2);
    } else if (provinces.length === 1) {
      setProvince(provinces[0]);
      setCity('');
      setStep(1);
    } else {
      setProvince('');
      setCity('');
      setStep(0);
    }
    setOpen(true);
  };
  const close = () => setOpen(false);
  const back = () => (step === 0 || (step === 1 && provinces.length === 1) ? close() : goTo((step - 1) as Step));
  const choose = (area: Barangay) => { onChange(area.id); close(); };

  const items = useMemo<Item[]>(() => {
    if (!open) return [];
    const query = fold(search);
    const matches = (text: string) => !query || fold(text).includes(query);
    const withLetters = (options: Omit<Extract<Item, { kind: 'option' }>, 'kind' | 'letter'>[]): Item[] =>
      options.map((option, index) => {
        const letter = initial(option.label);
        const previous = index > 0 ? initial(options[index - 1].label) : '';
        return { kind: 'option', ...option, letter: !query && letter !== previous ? letter : undefined };
      });

    if (step === 0) {
      const list: Item[] = withLetters(provinces.filter(matches).map((name) => ({
        key: `p:${name}`,
        label: name,
        selected: name === province,
        onPress: () => { setProvince(name); setCity(''); goTo(1); },
      })));
      if (query.length >= 2) {
        const found = areas
          .filter((area) => fold(area.barangayName).includes(query))
          .sort((a, b) =>
            Number(!fold(a.barangayName).startsWith(query)) - Number(!fold(b.barangayName).startsWith(query))
            || byName(a.barangayName, b.barangayName))
          .slice(0, 60);
        if (found.length) {
          list.push({ kind: 'heading', key: 'h:barangays', label: t('Matching barangays', 'Mga barangay nga nagtugma') });
          for (const area of found)
            list.push({ kind: 'option', key: area.id, label: area.barangayName, detail: `${area.city}, ${area.province}`, selected: area.id === value, onPress: () => choose(area) });
        }
      }
      return list;
    }
    if (step === 1) {
      const cities = unique(areas.filter((area) => area.province === province).map((area) => area.city));
      return withLetters(cities.filter(matches).map((name) => ({
        key: `c:${name}`,
        label: name,
        selected: name === city,
        onPress: () => { setCity(name); goTo(2); },
      })));
    }
    return withLetters(areas
      .filter((area) => area.province === province && area.city === city && matches(area.barangayName))
      .sort((a, b) => byName(a.barangayName, b.barangayName))
      .map((area) => ({ key: area.id, label: area.barangayName, selected: area.id === value, onPress: () => choose(area) })));
  }, [open, step, search, areas, provinces, province, city, value, t]);

  const reached = (index: number) => index === 0 ? provinces.length > 1 : index === 1 ? !!province : !!city;
  const crumb = (index: number) => index === 0 ? province : index === 1 ? city : '';

  return (
    <View style={{ gap: 8 }}>
      <Txt variant="label">{label}</Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: selected ? `${selected.barangayName}, ${selected.city}, ${selected.province}` : prompt }}
        accessibilityState={{ disabled: unavailable, expanded: open }}
        disabled={unavailable}
        onPress={show}
        style={[styles.input, styles.row, { minHeight: 56, paddingVertical: 10 }, error && { borderColor: c.error }, unavailable && { opacity: 0.6 }]}
      >
        <MapPin size={19} color={selected ? c.primary : c.subtle} />
        <View style={{ flex: 1 }}>
          <Txt style={{ fontSize: 16, color: selected ? c.text : c.muted }} numberOfLines={1}>{selected ? selected.barangayName : prompt}</Txt>
          {selected && <Txt variant="small" numberOfLines={1}>{`${selected.city}, ${selected.province}`}</Txt>}
        </View>
        <ChevronDown size={20} color={c.muted} />
      </Pressable>
      {error && <Txt variant="small" accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: c.error }}>{error}</Txt>}
      <Modal visible={open} animationType="slide" onRequestClose={back}>
        <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: c.card, paddingTop: insets.top }}>
          <View style={[styles.row, { paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderColor: c.outline }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('Back', 'Balik')} onPress={back} style={{ padding: 12 }}>
              <ArrowLeft size={22} color={c.text} />
            </Pressable>
            <Txt accessibilityRole="header" variant="heading" style={{ flex: 1 }}>{t('Select address', 'Pilia ang adres')}</Txt>
            <Pressable accessibilityRole="button" accessibilityLabel={t('Close', 'Isira')} onPress={close} style={{ padding: 12 }}>
              <X size={22} color={c.muted} />
            </Pressable>
          </View>

          <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: c.outline }}>
            {stepLabels.map((name, index) => {
              const active = index === step;
              const enabled = reached(index) && index <= step;
              return (
                <Pressable
                  key={name}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active, disabled: !enabled }}
                  disabled={!enabled || active}
                  onPress={() => goTo(index as Step)}
                  style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', borderBottomWidth: 2.5, borderColor: active ? c.primary : 'transparent' }}
                >
                  <Txt variant="caption" style={{ color: active ? c.primary : c.muted, fontFamily: active ? fonts.semibold : fonts.medium }}>{name}</Txt>
                  <Txt numberOfLines={1} style={{ fontSize: 13, color: crumb(index) ? c.text : c.subtle }}>
                    {crumb(index) || (index === step ? t('Select', 'Pili') : '—')}
                  </Txt>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.row, { margin: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.outline }]}>
            <Search size={18} color={c.subtle} />
            <TextInput
              accessibilityLabel={t(`Search ${stepLabels[step]}`, `Pangitaa ang ${stepLabels[step]}`)}
              value={search}
              onChangeText={setSearch}
              placeholder={step === 0
                ? t('Search province or barangay', 'Pangitaa ang probinsya o barangay')
                : t(`Search ${stepLabels[step].toLocaleLowerCase()}`, `Pangitaa ang ${stepLabels[step].toLocaleLowerCase()}`)}
              placeholderTextColor={c.subtle}
              autoCorrect={false}
              style={{ flex: 1, minHeight: 46, fontSize: 16, color: c.text, fontFamily: fonts.regular }}
            />
            {!!search && (
              <Pressable accessibilityRole="button" accessibilityLabel={t('Clear search', 'Limpyohi ang pangita')} onPress={() => setSearch('')} style={{ padding: 6 }}>
                <X size={18} color={c.muted} />
              </Pressable>
            )}
          </View>

          <FlatList
            data={items}
            keyExtractor={(item) => item.key}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            initialNumToRender={20}
            windowSize={11}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            ListEmptyComponent={
              <Txt accessibilityLiveRegion="polite" style={{ padding: 20, color: c.muted, textAlign: 'center' }}>
                {t('No matches. Check the spelling and try again.', 'Walay nagtugma. Susiha ang spelling ug sulayi pag-usab.')}
              </Txt>
            }
            renderItem={({ item }) => item.kind === 'heading' ? (
              <Txt variant="caption" style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6, color: c.muted, backgroundColor: c.surface }}>
                {item.label}
              </Txt>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: item.selected }}
                accessibilityLabel={item.detail ? `${item.label}, ${item.detail}` : item.label}
                onPress={item.onPress}
                style={({ pressed }) => [
                  styles.row,
                  { minHeight: 52, paddingRight: 16, borderBottomWidth: 1, borderColor: c.outline },
                  (pressed || item.selected) && { backgroundColor: c.primarySoft },
                ]}
              >
                <Txt style={{ width: 40, textAlign: 'center', color: c.primary, fontFamily: fonts.semibold }}>{item.letter ?? ''}</Txt>
                <View style={{ flex: 1, paddingVertical: 10 }}>
                  <Txt style={{ fontSize: 16, color: item.selected ? c.primary : c.text, fontFamily: item.selected ? fonts.semibold : fonts.regular }}>{item.label}</Txt>
                  {item.detail && <Txt variant="small">{item.detail}</Txt>}
                </View>
                {item.selected ? <Check size={18} color={c.primary} /> : step < 2 && !item.detail ? <ChevronRight size={18} color={c.subtle} /> : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}
