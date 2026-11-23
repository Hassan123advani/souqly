import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Wand2 } from 'lucide-react';
import { Button, FormField, Textarea } from '@/components/ui';
import { fieldError } from './forms/fieldError';

const KINDS = ['shipping', 'returns', 'warranty'] as const;

/** Shipping / returns / warranty policy textareas with one-click templates. `prefix` e.g. "policies.". */
export function PolicyFields({ prefix = 'policies.' }: { prefix?: string }) {
  const { t } = useTranslation();
  const { register, setValue, formState } = useFormContext();
  return (
    <div className="grid gap-5">
      {KINDS.map((k) => (
        <FormField
          key={k}
          label={t(`seller.policies.${k}`)}
          error={fieldError(formState.errors, `${prefix}${k}`)}
          labelAside={
            <Button
              type="button"
              size="sm"
              variant="ghost"
              leftIcon={<Wand2 className="size-4" />}
              onClick={() => setValue(`${prefix}${k}`, t(`seller.policies.templates.${k}`), { shouldDirty: true })}
            >
              {t('seller.policies.useTemplate')}
            </Button>
          }
        >
          <Textarea rows={4} maxLength={3000} {...register(`${prefix}${k}`)} />
        </FormField>
      ))}
    </div>
  );
}
