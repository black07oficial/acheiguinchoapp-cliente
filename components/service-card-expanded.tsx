// ============================================================
// Component: ServiceCardExpanded
// Description: Modal/BottomSheet expandido com detalhes do serviço
// ============================================================

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  ScrollView,
  Image,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import type { ServicoDisponivel } from '../types/service';
import { formatPrice, formatTime, formatDistance, getServiceIcon } from '../lib/services';
import { THEME_COLORS } from '../hooks/use-dynamic-theme';

const { width, height } = Dimensions.get('window');

interface ServiceCardExpandedProps {
  visible: boolean;
  servico: ServicoDisponivel | null;
  onClose: () => void;
  onConfirm: (servico: ServicoDisponivel) => void;
  isDark: boolean;
}

export function ServiceCardExpanded({
  visible,
  servico,
  onClose,
  onConfirm,
  isDark,
}: ServiceCardExpandedProps) {
  if (!servico) return null;

  const bgColor = isDark ? '#0A0E12' : '#FFFFFF';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC';
  const textColor = isDark ? '#FFFFFF' : '#0f172a';
  const textSecondaryColor = isDark ? 'rgba(255,255,255,0.6)' : '#64748b';
  const borderColor = isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        
        <View style={[styles.container, { backgroundColor: bgColor }]}>
          {/* Handle */}
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : '#E5E7EB' }]} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialIcons name="close" size={24} color={textSecondaryColor} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: textColor }]}>
              {servico.tipo_servico_nome}
            </Text>
            <View style={{ width: 32 }} />
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Prestador Info */}
            <View style={[styles.providerSection, { backgroundColor: cardBg, borderColor }]}>
              {/* Avatar */}
              <View style={styles.avatarContainer}>
                {servico.prestador_foto_url ? (
                  <Image
                    source={{ uri: servico.prestador_foto_url }}
                    style={styles.avatar}
                  />
                ) : (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: THEME_COLORS.primary + '20' }]}>
                    <MaterialIcons name="person" size={40} color={THEME_COLORS.primary} />
                  </View>
                )}
              </View>

              {/* Nome e Rating */}
              <Text style={[styles.providerName, { color: textColor }]}>
                {servico.prestador_nome}
              </Text>
              
              <View style={styles.ratingRow}>
                <View style={styles.starsContainer}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <MaterialIcons
                      key={star}
                      name={star <= Math.round(servico.prestador_rating) ? 'star' : 'star-outline'}
                      size={18}
                      color="#fbbf24"
                    />
                  ))}
                </View>
                <Text style={[styles.ratingText, { color: textColor }]}>
                  {servico.prestador_rating.toFixed(1)}
                </Text>
                <Text style={[styles.servicesCount, { color: textSecondaryColor }]}>
                  • {servico.prestador_total_servicos} serviços realizados
                </Text>
              </View>

              {/* Distância e Tempo */}
              <View style={styles.infoRow}>
                <View style={styles.infoItem}>
                  <MaterialIcons name="place" size={18} color={THEME_COLORS.primary} />
                  <Text style={[styles.infoText, { color: textSecondaryColor }]}>
                    {formatDistance(servico.distancia_km)} de distância
                  </Text>
                </View>
                <View style={styles.infoItem}>
                  <MaterialIcons name="schedule" size={18} color={THEME_COLORS.primary} />
                  <Text style={[styles.infoText, { color: textSecondaryColor }]}>
                    Chega em {formatTime(servico.tempo_estimado_min)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Preço */}
            <View style={[styles.priceSection, { backgroundColor: cardBg, borderColor }]}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>
                💰 Preço
              </Text>
              
              <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: textSecondaryColor }]}>
                  Taxa base
                </Text>
                <Text style={[styles.priceValue, { color: textColor }]}>
                  {formatPrice(servico.preco_base)}
                </Text>
              </View>

              {servico.preco_por_km > 0 && servico.distancia_viagem_km > 0 && (
                <View style={styles.priceRow}>
                  <Text style={[styles.priceLabel, { color: textSecondaryColor }]}>
                    Por km ({formatDistance(servico.distancia_viagem_km)})
                  </Text>
                  <Text style={[styles.priceValue, { color: textColor }]}>
                    {formatPrice(servico.preco_por_km * servico.distancia_viagem_km)}
                  </Text>
                </View>
              )}

              <View style={[styles.priceDivider, { backgroundColor: borderColor }]} />

              <View style={styles.priceRow}>
                <Text style={[styles.totalLabel, { color: textColor }]}>
                  TOTAL
                </Text>
                <Text style={[styles.totalValue, { color: THEME_COLORS.primary }]}>
                  {formatPrice(servico.preco_final)}
                </Text>
              </View>
            </View>

            {/* Tipo de Serviço */}
            <View style={[styles.serviceTypeSection, { backgroundColor: cardBg, borderColor }]}>
              <View style={styles.serviceTypeHeader}>
                <View style={[styles.serviceIconLarge, { backgroundColor: THEME_COLORS.primary + '15' }]}>
                  <MaterialIcons
                    name={getServiceIcon(servico.tipo_servico_id) as any}
                    size={32}
                    color={THEME_COLORS.primary}
                  />
                </View>
                <View style={styles.serviceTypeInfo}>
                  <Text style={[styles.serviceTypeName, { color: textColor }]}>
                    {servico.tipo_servico_nome}
                  </Text>
                  <Text style={[styles.serviceTypeDesc, { color: textSecondaryColor }]}>
                    {servico.tipo_servico_descricao || 'Serviço de guincho profissional'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Contato */}
            {servico.prestador_telefone && (
              <TouchableOpacity style={[styles.contactButton, { borderColor }]}>
                <MaterialIcons name="phone" size={20} color={THEME_COLORS.primary} />
                <Text style={[styles.contactText, { color: THEME_COLORS.primary }]}>
                  {servico.prestador_telefone}
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          {/* Botão de Confirmação */}
          <View style={[styles.footer, { borderTopColor: borderColor }]}>
            <TouchableOpacity
              style={[styles.confirmButton, { backgroundColor: THEME_COLORS.primary }]}
              onPress={() => onConfirm(servico)}
              activeOpacity={0.9}
            >
              <MaterialIcons name="check-circle" size={22} color="#FFFFFF" />
              <Text style={styles.confirmButtonText}>
                ESCOLHER ESTE SERVIÇO
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: height * 0.85,
    minHeight: height * 0.6,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  providerSection: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  avatarContainer: {
    marginBottom: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerName: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  starsContainer: {
    flexDirection: 'row',
  },
  ratingText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  servicesCount: {
    fontSize: 13,
    marginLeft: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoText: {
    fontSize: 13,
    marginLeft: 6,
  },
  priceSection: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  priceLabel: {
    fontSize: 14,
  },
  priceValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  priceDivider: {
    height: 1,
    marginVertical: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  serviceTypeSection: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  serviceTypeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  serviceIconLarge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceTypeInfo: {
    flex: 1,
    marginLeft: 16,
  },
  serviceTypeName: {
    fontSize: 16,
    fontWeight: '600',
  },
  serviceTypeDesc: {
    fontSize: 13,
    marginTop: 4,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  contactText: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: THEME_COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
});
