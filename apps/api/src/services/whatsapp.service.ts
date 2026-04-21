import axios from 'axios';

export class WhatsAppService {
    /**
     * Sends a custom text message via WhatsApp Cloud API
     */
    static async sendTextMessage(params: {
        tenantId: string;
        to: string;
        message: string;
        settings: {
            enabled: boolean;
            phoneNumber: string;
            phoneNumberId?: string;
            apiKey: string;
        };
    }) {
        const { enabled, phoneNumber, phoneNumberId, apiKey } = params.settings;
        const targetId = String(phoneNumberId || phoneNumber || '').trim();

        if (!enabled || !apiKey || !targetId) {
            console.warn(`[WhatsAppService] Skipping message to ${params.to}: WhatsApp not configured or disabled for tenant ${params.tenantId}`);
            return false;
        }

        try {
            // Remove non-numeric characters from phone
            const cleanPhone = params.to.replace(/\D/g, '');

            if (!/^\d+$/.test(targetId)) {
                console.warn(
                    `[WhatsAppService] Invalid phoneNumberId for tenant ${params.tenantId}. Expected numeric phone_number_id, got: ${targetId}`
                );
                return false;
            }

            const response = await axios.post(
                `https://graph.facebook.com/v18.0/${targetId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: cleanPhone,
                    type: 'text',
                    text: { body: params.message }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log(`[WhatsAppService] Message sent to ${cleanPhone}: ${response.data.messages[0].id}`);
            return true;
        } catch (error: any) {
            console.error('[WhatsAppService] Error sending WhatsApp:', error.response?.data || error.message);
            return false;
        }
    }

    /**
     * Sends a welcome message with QR link / Member ID
     */
    static async sendWelcomeMessage(params: {
        tenantId: string;
        customer: { name: string; phone: string; id: number; customer_code?: string };
        settings: any;
    }) {
        const { customer, tenantId, settings } = params;
        const waSettings = settings?.whatsapp || {};
        
        const memberId = customer.customer_code || `#${customer.id}`;
        const message = `Merhaba ${customer.name}! 🌟 \n\nNextPOS sistemimize başarıyla üye oldunuz. \n\nÜye Numaranız: ${memberId}\nSiparişlerinizde bu numarayı kullanarak avantajlardan yararlanabilirsiniz. \n\nKeyifli günler dileriz! 🍽️`;

        return this.sendTextMessage({
            tenantId,
            to: customer.phone,
            message,
            settings: {
                enabled: waSettings.enabled,
                phoneNumber: waSettings.phoneNumber,
                phoneNumberId: waSettings.phoneNumberId,
                apiKey: waSettings.apiKey
            }
        });
    }

    /**
     * Sends a notification that the order is ready
     */
    static async sendOrderReadyMessage(params: {
        tenantId: string;
        order: { id: number; type: string; phone: string; name?: string };
        settings: any;
    }) {
        const { order, tenantId, settings } = params;
        const waSettings = settings?.whatsapp || {};
        
        const typeLabel = order.type === 'takeaway' ? 'GEL-AL' : 'PAKET';
        const message = `Sayın ${order.name || 'Müşterimiz'}! 🌟 \n\n${order.id} numaralı ${typeLabel} siparişiniz HAZIRLANDI. \n\n${order.type === 'takeaway' ? 'Kısa süre içinde şubemizden teslim alabilirsiniz.' : 'Kuryemiz paketinizi teslim alarak yola çıkacaktır.'} \n\nAfiyet olsun! 🍽️`;

        return this.sendTextMessage({
            tenantId,
            to: order.phone,
            message,
            settings: {
                enabled: waSettings.enabled,
                phoneNumber: waSettings.phoneNumber,
                phoneNumberId: waSettings.phoneNumberId,
                apiKey: waSettings.apiKey
            }
        });
    }

    /**
     * Sends generic order status updates for WhatsApp/online channels
     */
    static async sendOrderStatusMessage(params: {
        tenantId: string;
        order: { id: number; type: string; phone: string; status: string; name?: string };
        settings: any;
    }) {
        const { order, tenantId, settings } = params;
        const waSettings = settings?.whatsapp || {};
        const typeLabel = order.type === 'takeaway' ? 'GEL-AL' : order.type === 'delivery' ? 'PAKET' : 'SIPARIS';
        const customerName = order.name || 'Müşterimiz';
        const statusMap: Record<string, string> = {
            confirmed: 'onaylandı',
            preparing: 'hazırlanmaya alındı',
            ready: 'hazırlandı',
            shipped: 'teslimata çıktı',
            completed: 'tamamlandı',
            cancelled: 'iptal edildi',
        };
        const statusText = statusMap[String(order.status || '').toLowerCase()] || String(order.status || 'güncellendi');
        const message = `Sayın ${customerName}! 🌟\n\n${order.id} numaralı ${typeLabel} siparişiniz ${statusText}.\n\nBizi tercih ettiğiniz için teşekkür ederiz.`;

        return this.sendTextMessage({
            tenantId,
            to: order.phone,
            message,
            settings: {
                enabled: waSettings.enabled,
                phoneNumber: waSettings.phoneNumber,
                phoneNumberId: waSettings.phoneNumberId,
                apiKey: waSettings.apiKey
            }
        });
    }
}
