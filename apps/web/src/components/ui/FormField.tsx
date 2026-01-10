'use client';

import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';
import styles from './FormField.module.css';

interface BaseFieldProps {
    label: string;
    error?: string;
    hint?: string;
    required?: boolean;
}

interface InputFieldProps extends BaseFieldProps, Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
    type?: 'text' | 'email' | 'password' | 'number' | 'url' | 'tel';
}

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(
    ({ label, error, hint, required, id, ...props }, ref) => {
        const fieldId = id || label.toLowerCase().replace(/\s+/g, '-');
        
        return (
            <div className={styles.field}>
                <label htmlFor={fieldId} className={styles.label}>
                    {label}
                    {required && <span className={styles.required}>*</span>}
                </label>
                <input
                    ref={ref}
                    id={fieldId}
                    className={`${styles.input} ${error ? styles.inputError : ''}`}
                    aria-invalid={!!error}
                    aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
                    {...props}
                />
                {hint && !error && (
                    <span id={`${fieldId}-hint`} className={styles.hint}>{hint}</span>
                )}
                {error && (
                    <span id={`${fieldId}-error`} className={styles.error} role="alert">{error}</span>
                )}
            </div>
        );
    }
);
InputField.displayName = 'InputField';

interface TextareaFieldProps extends BaseFieldProps, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {}

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
    ({ label, error, hint, required, id, ...props }, ref) => {
        const fieldId = id || label.toLowerCase().replace(/\s+/g, '-');
        
        return (
            <div className={styles.field}>
                <label htmlFor={fieldId} className={styles.label}>
                    {label}
                    {required && <span className={styles.required}>*</span>}
                </label>
                <textarea
                    ref={ref}
                    id={fieldId}
                    className={`${styles.textarea} ${error ? styles.inputError : ''}`}
                    aria-invalid={!!error}
                    {...props}
                />
                {hint && !error && <span className={styles.hint}>{hint}</span>}
                {error && <span className={styles.error} role="alert">{error}</span>}
            </div>
        );
    }
);
TextareaField.displayName = 'TextareaField';

interface SelectOption {
    value: string;
    label: string;
}

interface SelectFieldProps extends BaseFieldProps, Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
    options: SelectOption[];
    placeholder?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
    ({ label, error, hint, required, options, placeholder, id, ...props }, ref) => {
        const fieldId = id || label.toLowerCase().replace(/\s+/g, '-');
        
        return (
            <div className={styles.field}>
                <label htmlFor={fieldId} className={styles.label}>
                    {label}
                    {required && <span className={styles.required}>*</span>}
                </label>
                <select
                    ref={ref}
                    id={fieldId}
                    className={`${styles.select} ${error ? styles.inputError : ''}`}
                    aria-invalid={!!error}
                    {...props}
                >
                    {placeholder && <option value="">{placeholder}</option>}
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
                {hint && !error && <span className={styles.hint}>{hint}</span>}
                {error && <span className={styles.error} role="alert">{error}</span>}
            </div>
        );
    }
);
SelectField.displayName = 'SelectField';

interface CheckboxFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> {
    label: string;
    description?: string;
}

export const CheckboxField = forwardRef<HTMLInputElement, CheckboxFieldProps>(
    ({ label, description, id, ...props }, ref) => {
        const fieldId = id || label.toLowerCase().replace(/\s+/g, '-');
        
        return (
            <label htmlFor={fieldId} className={styles.checkboxWrapper}>
                <input
                    ref={ref}
                    id={fieldId}
                    type="checkbox"
                    className={styles.checkbox}
                    {...props}
                />
                <div className={styles.checkboxContent}>
                    <span className={styles.checkboxLabel}>{label}</span>
                    {description && <span className={styles.checkboxDesc}>{description}</span>}
                </div>
            </label>
        );
    }
);
CheckboxField.displayName = 'CheckboxField';

interface FormGroupProps {
    children: ReactNode;
    columns?: 1 | 2 | 3;
}

export function FormGroup({ children, columns = 1 }: FormGroupProps) {
    return (
        <div className={styles.formGroup} style={{ '--columns': columns } as React.CSSProperties}>
            {children}
        </div>
    );
}

interface FormActionsProps {
    children: ReactNode;
}

export function FormActions({ children }: FormActionsProps) {
    return <div className={styles.formActions}>{children}</div>;
}


