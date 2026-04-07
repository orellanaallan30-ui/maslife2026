// emailService.ts — Cliente para llamar Edge Functions de Supabase
import { supabase } from './supabaseClient';

export const emailService = {
  /**
   * Envía el email de consentimiento informado al paciente.
   * Llama a la Edge Function `send-consent-email`.
   */
  async sendConsentEmail(consentId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('send-consent-email', {
        body: { consentId },
      });

      if (error) {
        console.error('[emailService] Error:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error('[emailService] Excepción:', err);
      return { success: false, error: 'Error de conexión con el servidor de email' };
    }
  },

  /**
   * Envía recordatorio de cita al paciente.
   * Llama a la Edge Function `send-appointment-reminder`.
   */
  async sendAppointmentReminder(appointmentId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('send-appointment-reminder', {
        body: { appointmentId },
      });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err) {
      return { success: false, error: 'Error de conexión' };
    }
  },
};
