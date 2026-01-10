'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { AdminLayout } from '@/components/admin';
import { 
    InputField, TextareaField, SelectField, CheckboxField, 
    FormGroup, FormActions, useToast, Skeleton 
} from '@/components/ui';
import { useMutation, useQuery } from '@/hooks';
import { api } from '@/lib/api';
import { Loader2, Calendar, Clock } from 'lucide-react';

const formStyles = {
    form: { display: 'flex', flexDirection: 'column' as const, gap: '24px' },
    formCard: { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' },
    formSection: { fontSize: '16px', fontWeight: 600, marginBottom: '20px', color: 'var(--text-primary)' },
    checkboxGroup: { display: 'flex', flexDirection: 'column' as const, gap: '12px' },
};

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

// Helper to convert local date/time to ISO string
function toISOStringWithTimezone(date: string, time: string): string | null {
    if (!date || !time) return null;
    const dateTimeStr = `${date}T${time}:00`;
    const localDate = new Date(dateTimeStr);
    return localDate.toISOString();
}

// Helper to extract date and time from ISO string for form display
function parseScheduledDateTime(isoString: string | null): { date: string; time: string } {
    if (!isoString) return { date: '', time: '' };
    const d = new Date(isoString);
    const date = d.toISOString().split('T')[0]; // YYYY-MM-DD
    const time = d.toTimeString().slice(0, 5);  // HH:MM
    return { date, time };
}

export default function EditExamPage() {
    const router = useRouter();
    const params = useParams();
    const examId = params.id as string;
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
        // Scheduling
        enableScheduling: false,
        scheduledDate: '',
        scheduledStartTime: '',
        scheduledEndTime: '',
        timezone: 'Asia/Kolkata',
    });

    const [errors, setErrors] = useState<Partial<Record<keyof ExamFormData, string>>>({});

    const { data: exam, isLoading: loadingExam } = useQuery(
        () => api.getExam(examId),
        { enabled: !!examId }
    );

    const { data: challengesData, isLoading: loadingChallenges } = useQuery(
        () => api.getAllChallenges()
    );

    // Populate form when exam loads
    useEffect(() => {
        if (exam) {
            const hasSchedule = !!(exam.scheduledStartAt || exam.scheduledEndAt);
            const startParsed = parseScheduledDateTime(exam.scheduledStartAt);
            const endParsed = parseScheduledDateTime(exam.scheduledEndAt);
            
            setForm({
                title: exam.title || '',
                description: exam.description || '',
                challengeId: exam.challengeId || '',
                timeLimit: exam.timeLimit || 60,
                maxAttempts: exam.maxAttempts || 1,
                passThreshold: exam.passThreshold || 0.7,
                pasteDisabled: exam.pasteDisabled ?? true,
                fullscreenRequired: exam.fullscreenRequired ?? true,
                // Scheduling
                enableScheduling: hasSchedule,
                scheduledDate: startParsed.date || endParsed.date || '',
                scheduledStartTime: startParsed.time || '',
                scheduledEndTime: endParsed.time || '',
                timezone: exam.timezone || 'Asia/Kolkata',
            });
        }
    }, [exam]);

    const updateMutation = useMutation(
        (data: ExamFormData) => api.updateExam(examId, data),
        {
            onSuccess: () => {
                toast.success('Exam updated successfully');
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
            // Build submission data
            const submitData: Parameters<typeof api.updateExam>[1] = {
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

            // Add or clear scheduling
            if (form.enableScheduling && form.scheduledDate) {
                submitData.scheduledStartAt = toISOStringWithTimezone(form.scheduledDate, form.scheduledStartTime);
                submitData.scheduledEndAt = toISOStringWithTimezone(form.scheduledDate, form.scheduledEndTime);
            } else {
                // Clear scheduling if disabled
                submitData.scheduledStartAt = null;
                submitData.scheduledEndAt = null;
            }

            updateMutation.mutate(submitData as unknown as ExamFormData);
        }
    };

    const challengeOptions = (challengesData || []).map((c) => ({
        value: c.id,
        label: c.name,
    }));

    if (loadingExam) {
        return (
            <AdminLayout
                title="Edit Exam"
                breadcrumbs={[
                    { label: 'Dashboard', href: '/admin' },
                    { label: 'Exams', href: '/admin/exams' },
                    { label: 'Edit' },
                ]}
            >
                <div style={formStyles.formCard}>
                    <Skeleton height={24} width="40%" />
                    <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <Skeleton height={40} />
                        <Skeleton height={80} />
                        <Skeleton height={40} />
                    </div>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout
            title="Edit Exam"
            breadcrumbs={[
                { label: 'Dashboard', href: '/admin' },
                { label: 'Exams', href: '/admin/exams' },
                { label: exam?.title || 'Edit' },
            ]}
        >
            <form onSubmit={handleSubmit} style={formStyles.form}>
                <div style={formStyles.formCard}>
                    <h2 style={formStyles.formSection}>Basic Information</h2>
                    
                    <InputField
                        label="Title"
                        value={form.title}
                        onChange={(e) => updateField('title', e.target.value)}
                        placeholder="e.g., Junior Backend Developer Assessment"
                        error={errors.title}
                        required
                    />

                    <div style={{ marginTop: 16 }}>
                        <TextareaField
                            label="Description"
                            value={form.description}
                            onChange={(e) => updateField('description', e.target.value)}
                            placeholder="Brief description of the exam..."
                            rows={3}
                        />
                    </div>

                    <div style={{ marginTop: 16 }}>
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
                </div>

                <div style={formStyles.formCard}>
                    <h2 style={formStyles.formSection}>Settings</h2>
                    
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

                <div style={formStyles.formCard}>
                    <h2 style={formStyles.formSection}>
                        <Calendar size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                        Exam Schedule (Optional)
                    </h2>
                    
                    <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '14px' }}>
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

                <div style={formStyles.formCard}>
                    <h2 style={formStyles.formSection}>Proctoring</h2>
                    
                    <div style={formStyles.checkboxGroup}>
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
                        disabled={updateMutation.isLoading}
                    >
                        {updateMutation.isLoading ? (
                            <>
                                <Loader2 size={16} className="spinner" /> Saving...
                            </>
                        ) : (
                            'Save Changes'
                        )}
                    </button>
                </FormActions>
            </form>
        </AdminLayout>
    );
}

