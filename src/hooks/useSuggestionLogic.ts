import { useState, useRef, useEffect } from 'react';
import { User, Suggestion } from '@/types';
import { supabase } from '@/lib/supabaseClient';

export const useSuggestionLogic = (currentUser: User) => {
    const [showSuggestionPanel, setShowSuggestionPanel] = useState(false);
    const [suggestionText, setSuggestionText] = useState('');
    const [isSubmittingSuggestion, setIsSubmittingSuggestion] = useState(false);
    const [suggestionStatus, setSuggestionStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const suggestionScrollRef = useRef<HTMLDivElement>(null);

    // Suggestion Board Sync & Realtime
    useEffect(() => {
        if (!showSuggestionPanel || !supabase) return;

        // Initial Fetch
        supabase.from('suggestions').select('*').order('timestamp', { ascending: false }).limit(50).then(({ data }) => {
            if (data) setSuggestions(data as any);
        });

        // Realtime Subscription
        const channel = supabase.channel('suggestions_board')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'suggestions' }, (payload) => {
                setSuggestions(prev => {
                    if (prev.some(s => s.id === payload.new.id)) return prev;
                    return [payload.new as any, ...prev].slice(0, 50);
                });
                // Auto scroll to top if user is near top? Or just let them see the new item.
                if (suggestionScrollRef.current && suggestionScrollRef.current.scrollTop < 50) {
                    suggestionScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                }
            })
            .subscribe();

        return () => { supabase?.removeChannel(channel); };
    }, [showSuggestionPanel]);


    const handleSuggestionSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!suggestionText.trim() || !supabase) return;

        setIsSubmittingSuggestion(true);
        try {
            const { error } = await supabase.from('suggestions').insert({
                user_id: currentUser.id,
                user_name: currentUser.name,
                content: suggestionText.trim(),
                timestamp: new Date().toISOString()
            });

            if (error) throw error;

            setSuggestionText('');
            setSuggestionStatus('success');
            setTimeout(() => setSuggestionStatus('idle'), 3000);

            // Optimistic update is handled by subscription, but we can do it here too if latency is high?
            // Subscription covers it.
        } catch (err) {
            console.error('Suggestion submit error:', err);
            setSuggestionStatus('error');
        } finally {
            setIsSubmittingSuggestion(false);
        }
    };

    return {
        showSuggestionPanel,
        setShowSuggestionPanel,
        suggestionText,
        setSuggestionText,
        isSubmittingSuggestion,
        suggestionStatus,
        suggestions,
        suggestionScrollRef,
        handleSuggestionSubmit
    };
};
