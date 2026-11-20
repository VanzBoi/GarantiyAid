import React, { useMemo, useState } from 'react';
import { FlatList, Keyboard, Modal, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronDown, Search, X, type LucideIcon } from 'lucide-react-native';
import { styles, Txt } from './components';
import { useDemo } from './state';
import { colors as c, fonts, radius } from './theme';

export type PickerOption = { value: string; label: string; detail?: string; group: string; keywords?: string };
type Item = { kind: 'heading'; key: string; label: string } | { kind: 'option'; key: string; option: PickerOption };

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase().trim();

/** Searchable full-screen dropdown with grouped options, used for ID types and programs. */
export function OptionPicker({
  label, placeholder, title, searchPlaceholder, emptyText, value, onChange, error, options, groups, icon: Icon,
}: {
  label: string;
  placeholder: string;
  title: string;
  searchPlaceholder: string;
  emptyText: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  options: PickerOption[];
  groups: { key: string; label: string }[];
  icon: LucideIcon;
}) {
  const { t } = useDemo();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = options.find((option) => option.value === value);
  const items = useMemo<Item[]>(() => {
    const query = fold(search);
    const matches = options.filter((option) => !query || fold(`${option.label} ${option.detail ?? ''} ${option.keywords ?? ''}`).includes(query));
    if (query) return matches.map((option) => ({ kind: 'option', key: option.value, option }));
    return groups.flatMap((group) => {
      const inGroup = matches.filter((option) => option.group === group.key);
      return inGroup.length
        ? [{ kind: 'heading' as const, key: `h:${group.key}`, label: group.label }, ...inGroup.map((option) => ({ kind: 'option' as const, key: option.value, option }))]
        : [];
    });
  }, [search, options, groups]);
  const close = () => { setOpen(false); setSearch(''); };

  return (
    <View style={{ gap: 8 }}>
      <Txt variant="label">{label}</Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={error ? `${label}. ${t('Error', 'Sayop')}: ${error}` : label}
        accessibilityValue={{ text: selected ? selected.label : placeholder }}
        accessibilityState={{ expanded: open }}
        onPress={() => { Keyboard.dismiss(); setOpen(true); }}
        style={({ pressed }) => [styles.input, styles.row, { minHeight: 56, paddingVertical: 10 }, error && { borderColor: c.error }, pressed && { backgroundColor: c.primarySoft }]}
      >
        <Icon size={20} color={selected ? c.primary : c.subtle} />
        <View style={{ flex: 1 }}>
          <Txt style={{ fontSize: 16, color: selected ? c.text : c.muted }} numberOfLines={2}>{selected ? selected.label : placeholder}</Txt>
          {selected?.detail ? <Txt variant="small" numberOfLines={1}>{selected.detail}</Txt> : null}
        </View>
        <ChevronDown size={20} color={c.muted} />
      </Pressable>
      {error ? <Txt variant="small" accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ color: c.error }}>{error}</Txt> : null}
      <Modal visible={open} animationType="slide" onRequestClose={close}>
        <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: c.card, paddingTop: insets.top }}>
          <View style={[styles.row, { paddingLeft: 20, paddingRight: 8, paddingVertical: 6, borderBottomWidth: 1, borderColor: c.outline }]}>
            <Txt accessibilityRole="header" variant="heading" style={{ flex: 1 }}>{title}</Txt>
            <Pressable accessibilityRole="button" accessibilityLabel={t('Close', 'Isira')} onPress={close} style={{ padding: 12 }}>
              <X size={22} color={c.text} />
            </Pressable>
          </View>
          <View style={{ padding: 16, paddingBottom: 8 }}>
            <View style={[styles.input, styles.row, { minHeight: 48 }]}>
              <Search size={18} color={c.subtle} />
              <TextInput
                accessibilityLabel={searchPlaceholder}
                value={search}
                onChangeText={setSearch}
                placeholder={searchPlaceholder}
                placeholderTextColor={c.subtle}
                autoCorrect={false}
                style={{ flex: 1, fontSize: 16, fontFamily: fonts.regular, color: c.text, paddingVertical: 10 }}
              />
            </View>
          </View>
          <FlatList
            data={items}
            keyExtractor={(item) => item.key}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
            ListEmptyComponent={<Txt style={{ color: c.muted, textAlign: 'center', paddingVertical: 32 }}>{emptyText}</Txt>}
            renderItem={({ item }) => {
              if (item.kind === 'heading') {
                return <Txt variant="caption" style={{ color: c.muted, letterSpacing: 0.8, paddingTop: 18, paddingBottom: 6, textTransform: 'uppercase' }}>{item.label}</Txt>;
              }
              const active = item.option.value === value;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  onPress={() => { onChange(item.option.value); close(); }}
                  style={({ pressed }) => [{
                    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 12, paddingVertical: 10,
                    borderRadius: radius.md, marginBottom: 4, borderWidth: 1.5, borderColor: active ? c.primary : 'transparent',
                    backgroundColor: active ? c.primarySoft : pressed ? c.surface : 'transparent',
                  }]}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? c.card : c.primarySoft }}>
                    <Icon size={20} color={c.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt variant="label" style={{ color: active ? c.primary : c.text }}>{item.option.label}</Txt>
                    {item.option.detail ? <Txt variant="small">{item.option.detail}</Txt> : null}
                  </View>
                  {active && <Check size={20} color={c.primary} />}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}
