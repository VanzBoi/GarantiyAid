import React from 'react';
import { IdCard } from 'lucide-react-native';
import { ID_TYPES } from './id-types';
import { OptionPicker } from './option-picker';
import { useDemo } from './state';

export function IdTypePicker({ value, onChange, error }: { value: string; onChange: (code: string) => void; error?: string }) {
  const { t } = useDemo();
  return (
    <OptionPicker
      icon={IdCard}
      label={t('Type of ID', 'Klase sa ID')}
      placeholder={t('Choose an ID', 'Pagpili og ID')}
      title={t('Choose your ID', 'Pilia ang imong ID')}
      searchPlaceholder={t('Search, e.g. senior, PhilSys, UMID', 'Pangita, pananglitan senior, PhilSys, UMID')}
      emptyText={t('No matching ID. Choose "Other government-issued ID".', 'Walay nagtugma. Pilia ang "Laing ID nga gi-isyu sa gobyerno".')}
      value={value}
      onChange={onChange}
      error={error}
      options={ID_TYPES.map((type) => ({ value: type.code, label: t(type.en, type.bs), detail: type.issuer || undefined, group: type.group, keywords: `${type.en} ${type.bs}` }))}
      groups={[
        { key: 'featured', label: t('Most used for assistance', 'Kasagarang gamiton sa ayuda') },
        { key: 'government', label: t('Government-issued IDs', 'Mga ID gikan sa gobyerno') },
        { key: 'social', label: t('Barangay and social welfare', 'Barangay ug social welfare') },
        { key: 'other', label: t('Other IDs', 'Ubang mga ID') },
      ]}
    />
  );
}
