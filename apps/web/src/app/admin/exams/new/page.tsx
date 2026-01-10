'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminLayout } from '@/components/admin';
import { 
    InputField, TextareaField, SelectField, CheckboxField, 
    FormGroup, FormActions, useToast 
} from '@/components/ui';
import { useMutation, useQuery } from '@/hooks';
import { api } from '@/lib/api';
import { Loader2, Calendar, Clock } from 'lucide-react';
import styles from '../exams.module.css';

interface ExamFormData {
    title: string;
    description: string;
    challengeId: string;
    timeLimit: number;
    maxAttempts: number;
    passThreshold: number;
    pasteDisabled: boolean;
    fullscreenRequired: boolean;
    // Scheduling
    enableScheduling: boolean;
    scheduledDate: string;
    scheduledStartTime: string;
    scheduledEndTime: string;
    timezone: string;
}

// Helper to convert local date/time to ISO string in specified timezone
function toISOStringWithTimezone(date: string, time: string, timezone: string): string | null {
    if (!date || !time) return null;
    const dateTimeStr = `${date}T${time}:00`;
    // Create date and adjust for timezone offset
    const localDate = new Date(dateTimeStr);
    return localDate.toISOString();
}

export default function NewExamPage() {
    const router = useRouter();
    const toast = useToast();

    const [form, setForm] = useState<ExamFormData>({
        title: '',
        description: '',
        challengeId: '',
        timeLimit: 60,
        maxAttempts: 1,
        passThreshold: 0.7,
        pasteDisabled: true,
        fullscreenRequired: true,
        // Scheduling defaults
        enableScheduling: false,
        scheduledDate: '',
        scheduledStartTime: '',
        scheduledEndTime: '',
        timezone: 'Asia/Kolkata',
    });

    const [errors, setErrors] = useState<Partial<Record<keyof ExamFormData, string>>>({});

    const { data: challengesData, isLoading: loadingChallenges } = useQuery(
        () => api.getAllChallenges()
    );

    const createMutation = useMutation(
        (data: ExamFormData) => api.createExam(data),
        {
            onSuccess: () => {
                toast.success('Exam created successfully');
                router.push('/admin/exams');
            },
            onError: (err) => {
                toast.error(err.message);
            },
        }
    );

    const updateField = <K extends keyof ExamFormData>(field: K, value: ExamFormData[K]) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors((prev) => ({ ...prev, [field]: undefined }));
        }
    };

    const validate = (): boolean => {
        const newErrors: Partial<Record<keyof ExamFormData, string>> = {};

        if (!form.title.trim()) {
            newErrors.title = 'Title is required';
        }
        if (!form.challengeId) {
            newErrors.challengeId = 'Please select a challenge';
        }
        if (form.timeLimit < 1 || form.timeLimit > 480) {
            newErrors.timeLimit = 'Time limit must be between 1 and 480 minutes';
        }
        if (form.maxAttempts < 1 || form.maxAttempts > 10) {
            newErrors.maxAttempts = 'Max attempts must be between 1 and 10';
        }
        if (form.passThreshold < 0 || form.passThreshold > 1) {
            newErrors.passThreshold = 'Pass threshold must be between 0 and 1';
        }

        // Validate scheduling fields
        if (form.enableScheduling) {
            if (!form.scheduledDate) {
                newErrors.scheduledDate = 'Date is required for scheduled exams';
            }
            if (!form.scheduledStartTime) {
                newErrors.scheduledStartTime = 'Start time is required';
            }
            if (!form.scheduledEndTime) {
                newErrors.scheduledEndTime = 'End time is required';
            }
            if (form.scheduledStartTime && form.scheduledEndTime && form.scheduledStartTime >= form.scheduledEndTime) {
                newErrors.scheduledEndTime = 'End time must be after start time';
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (validate()) {
            // Build submission data with scheduling
            const submitData: Parameters<typeof api.createExam>[0] = {
                title: form.title,
                description: form.description || undefined,
                challengeId: form.challengeId,
                timeLimit: form.timeLimit,
                maxAttempts: form.maxAttempts,
                passThreshold: form.passThreshold,
                pasteDisabled: form.pasteDisabled,
                fullscreenRequired: form.fullscreenRequired,
                timezone: form.timezone,
            };

            // Add scheduling if enabled
            if (form.enableScheduling && form.scheduledDate) {
                submitData.scheduledStartAt = toISOStringWithTimezone(
                    form.scheduledDate, 
                    form.scheduledStartTime, 
                    form.timezone
                );
                submitData.scheduledEndAt = toISOStringWithTimezone(
                    form.scheduledDate, 
                    form.scheduledEndTime, 
                    form.timezone
                );
            }

            createMutation.mutate(submitData as ExamFormData);
        }
    };

    const challengeOptions = (challengesData || []).map((c) => ({
        value: c.id,
        label: c.name,
    }));

    return (
        <AdminLayout
            title="Create Exam"
            breadcrumbs={[
                { label: 'Dashboard', href: '/admin' },
                { label: 'Exams', href: '/admin/exams' },
                { label: 'Create' },
            ]}
        >
            <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.formCard}>
                    <h2 className={styles.formSection}>Basic Information</h2>
                    
                    <InputField
                        label="Title"
                        value={form.title}
                        onChange={(e) => updateField('title', e.target.value)}
                        placeholder="e.g., Junior Backend Developer Assessment"
                        error={errors.title}
                        required
                    />

                    <TextareaField
                        label="Description"
                        value={form.description}
                        onChange={(e) => updateField('description', e.target.value)}
                        placeholder="Brief description of the exam..."
                        rows={3}
                    />

                    <SelectField
                        label="Challenge"
                        value={form.challengeId}
                        onChange={(e) => updateField('challengeId', e.target.value)}
                        options={challengeOptions}
                        placeholder={loadingChallenges ? 'Loading...' : 'Select a challenge'}
                        error={errors.challengeId}
                        required
                        disabled={loadingChallenges}
                    />
                </div>

                <div className={styles.formCard}>
                    <h2 className={styles.formSection}>Settings</h2>
                    
                    <FormGroup columns={3}>
                        <InputField
                            label="Time Limit (minutes)"
                            type="number"
                            value={form.timeLimit}
                            onChange={(e) => updateField('timeLimit', parseInt(e.target.value) || 0)}
                            min={1}
                            max={480}
                            error={errors.timeLimit}
                            required
                        />

                        <InputField
                            label="Max Attempts"
                            type="number"
                            value={form.maxAttempts}
                            onChange={(e) => updateField('maxAttempts', parseInt(e.target.value) || 1)}
                            min={1}
                            max={10}
                            error={errors.maxAttempts}
                            required
                        />

                        <InputField
                            label="Pass Threshold"
                            type="number"
                            value={form.passThreshold}
                            onChange={(e) => updateField('passThreshold', parseFloat(e.target.value) || 0)}
                            min={0}
                            max={1}
                            step={0.05}
                            hint="0.7 = 70% to pass"
                            error={errors.passThreshold}
                            required
                        />
                    </FormGroup>
                </div>

                <div className={styles.formCard}>
                    <h2 className={styles.formSection}>
                        <Calendar size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                        Exam Schedule (Optional)
                    </h2>
                    
                    <p className={styles.formHint} style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
                        Set a specific date and time window for this exam. Candidates can only start during this window, 
                        and all attempts are auto-submitted at the end time.
                    </p>

                    <CheckboxField
                        label="Enable Scheduled Exam Window"
                        description="Set a fixed start and end time for this exam (IST timezone)"
                        checked={form.enableScheduling}
                        onChange={(e) => updateField('enableScheduling', e.target.checked)}
                    />

                    {form.enableScheduling && (
                        <div style={{ marginTop: '16px' }}>
                            <FormGroup columns={1}>
                                <InputField
                                    label="Exam Date"
                                    type="date"
                                    value={form.scheduledDate}
                                    onChange={(e) => updateField('scheduledDate', e.target.value)}
                                    error={errors.scheduledDate}
                                    required
                                />
                            </FormGroup>
                            
                            <FormGroup columns={2}>
                                <InputField
                                    label="Start Time (IST)"
                                    type="time"
                                    value={form.scheduledStartTime}
                                    onChange={(e) => updateField('scheduledStartTime', e.target.value)}
                                    error={errors.scheduledStartTime}
                                    hint="When candidates can start"
                                    required
                                />

                                <InputField
                                    label="End Time (IST)"
                                    type="time"
                                    value={form.scheduledEndTime}
                                    onChange={(e) => updateField('scheduledEndTime', e.target.value)}
                                    error={errors.scheduledEndTime}
                                    hint="Auto-submit all attempts"
                                    required
                                />
                            </FormGroup>

                            <div style={{ 
                                marginTop: '12px', 
                                padding: '12px', 
                                background: 'var(--bg-tertiary)', 
                                borderRadius: '8px',
                                fontSize: '13px',
                                color: 'var(--text-secondary)'
                            }}>
                                <Clock size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                                <strong>Note:</strong> All times are in IST (Indian Standard Time, UTC+5:30). 
                                At the scheduled end time, all in-progress attempts will be automatically submitted for grading.
                            </div>
                        </div>
                    )}
                </div>

                <div className={styles.formCard}>
                    <h2 className={styles.formSection}>Proctoring</h2>
                    
                    <div className={styles.checkboxGroup}>
                        <CheckboxField
                            label="Disable Paste"
                            description="Block clipboard paste operations during the exam"
                            checked={form.pasteDisabled}
                            onChange={(e) => updateField('pasteDisabled', e.target.checked)}
                        />

                        <CheckboxField
                            label="Require Fullscreen"
                            description="Exam must be taken in fullscreen mode"
                            checked={form.fullscreenRequired}
                            onChange={(e) => updateField('fullscreenRequired', e.target.checked)}
                        />
                    </div>
                </div>

                <FormActions>
                    <button
                        type="button"
                        onClick={() => router.push('/admin/exams')}
                        className="btn btn-secondary"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={createMutation.isLoading}
                    >
                        {createMutation.isLoading ? (
                            <>
                                <Loader2 size={16} className="spinner" /> Creating...
                            </>
                        ) : (
                            'Create Exam'
                        )}
                    </button>
                </FormActions>
            </form>
        </AdminLayout>
    );
}

