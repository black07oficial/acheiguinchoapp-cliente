// ============================================================
// Component: ServiceCard
// Description: Card colapsado de serviço disponível (estilo 99)
// ============================================================

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { ServicoDisponivel } from '../types/service';
import { formatPrice, formatTime, getServiceIcon } from '../lib/services';
import { THEME_COLORS } from '../hooks/use-dynamic-theme';

const { width } = Dimensions.get('window');

interface ServiceCardProps {
  servico: ServicoDisponivel;
  isSelected: boolean;
  onSelect: () => void;
  onExpand: () => void;
  isDark: boolean;
}

export function ServiceCard({ servico, isSelected, onSelect, onExpand, isDark }: ServiceCardProps) {
  const iconColor = THEME_COLORS.primary;
  const bgColor = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const borderColor = isSelected ? THEME_COLORS.primary : (isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB');
  const textColor = isDark ? '#FFFFFF' : '#0f172a';
  const textSecondaryColor = isDark ? 'rgba(255,255,255,0.6)' : '#64748b';

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: bgColor,
          borderColor,
          borderWidth: isSelected ? 2 : 1,
        },
      ]}
      onPress={onSelect}
      onLongPress={onExpand}
      activeOpacity={0.8}
    >
      {/* Header com ícone e nome do serviço */}
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: THEME_COLORS.primary + '15' }]}>
          <MaterialIcons
            name={getServiceIcon(servico.tipo_servico_id) as any}
            size={24}
            color={iconColor}
          />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.serviceName, { color: textColor }]}>
            {servico.tipo_servico_nome}
          </Text>
          <Text style={[styles.providerName, { color: textSecondaryColor }]} numberOfLines={1}>
            {servico.prestador_nome}
          </Text>
        </View>
        <View style={styles.priceContainer}>
          <Text style={[styles.price, { color: textColor }]}>
            {formatPrice(servico.preco_final)}
          </Text>
        </View>
      </View>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB' }]} />

      {/* Footer com rating, tempo e botão de expandir */}
      <View style={styles.footer}>
        <View style={styles.ratingContainer}>
          <MaterialIcons name="star" size={14} color="#fbbf24" />
          <Text style={[styles.rating, { color: textColor }]}>
            {servico.prestador_rating.toFixed(1)}
          </Text>
          <Text style={[styles.servicesCount, { color: textSecondaryColor }]}>
            • {servico.prestador_total_servicos} serviços
          </Text>
        </View>

        <View style={styles.timeContainer}>
          <MaterialIcons name="schedule" size={14} color={textSecondaryColor} />
          <Text style={[styles.time, { color: textSecondaryColor }]}>
            {formatTime(servico.tempo_estimado_min)}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.expandButton, { backgroundColor: THEME_COLORS.primary + '15' }]}
          onPress={onExpand}
        >
          <MaterialIcons name="expand-more" size={20} color={THEME_COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Indicador de seleção */}
      {isSelected && (
        <View style={[styles.selectedIndicator, { backgroundColor: THEME_COLORS.primary }]}>
          <MaterialIcons name="check" size={12} color="#FFFFFF" />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    marginLeft: 12,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '600',
  },
  providerName: {
    fontSize: 13,
    marginTop: 2,
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  price: {
    fontSize: 18,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginVertical: 10,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rating: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  servicesCount: {
    fontSize: 12,
    marginLeft: 4,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  time: {
    fontSize: 13,
    marginLeft: 4,
  },
  expandButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  selectedIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
