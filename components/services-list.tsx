// ============================================================
// Component: ServicesList
// Description: Lista de serviços disponíveis com loading e estados
// ============================================================

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { ServicoDisponivel } from '../types/service';
import { ServiceCard } from './service-card';
import { THEME_COLORS } from '../hooks/use-dynamic-theme';

const { width } = Dimensions.get('window');

interface ServicesListProps {
  services: ServicoDisponivel[];
  loading: boolean;
  error: string | null;
  selectedServiceId: string | null;
  onSelectService: (servico: ServicoDisponivel) => void;
  onExpandService: (servico: ServicoDisponivel) => void;
  onRefresh?: () => void;
  isDark: boolean;
}

export function ServicesList({
  services,
  loading,
  error,
  selectedServiceId,
  onSelectService,
  onExpandService,
  onRefresh,
  isDark,
}: ServicesListProps) {
  const textColor = isDark ? '#FFFFFF' : '#0f172a';
  const textSecondaryColor = isDark ? 'rgba(255,255,255,0.6)' : '#64748b';
  const borderColor = isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB';

  // Loading state
  if (loading && services.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={THEME_COLORS.primary} />
        <Text style={[styles.loadingText, { color: textSecondaryColor }]}>
          Buscando serviços disponíveis...
        </Text>
      </View>
    );
  }

  // Error state
  if (error && services.length === 0) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={48} color="#ef4444" />
        <Text style={[styles.errorTitle, { color: textColor }]}>
          Erro ao carregar serviços
        </Text>
        <Text style={[styles.errorMessage, { color: textSecondaryColor }]}>
          {error}
        </Text>
        {onRefresh && (
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: THEME_COLORS.primary }]}
            onPress={onRefresh}
          >
            <MaterialIcons name="refresh" size={20} color="#FFFFFF" />
            <Text style={styles.retryButtonText}>Tentar novamente</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Empty state
  if (!loading && services.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={[styles.emptyIconContainer, { backgroundColor: THEME_COLORS.primary + '15' }]}>
          <MaterialIcons name="local-shipping" size={48} color={THEME_COLORS.primary} />
        </View>
        <Text style={[styles.emptyTitle, { color: textColor }]}>
          Nenhum serviço disponível
        </Text>
        <Text style={[styles.emptyMessage, { color: textSecondaryColor }]}>
          Não há prestadores online na sua região no momento. Tente novamente em alguns minutos.
        </Text>
        {onRefresh && (
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: THEME_COLORS.primary }]}
            onPress={onRefresh}
          >
            <MaterialIcons name="refresh" size={20} color="#FFFFFF" />
            <Text style={styles.retryButtonText}>Atualizar</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // List header
  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <Text style={[styles.headerTitle, { color: textColor }]}>
          Serviços Disponíveis
        </Text>
        <Text style={[styles.headerCount, { color: textSecondaryColor }]}>
          {services.length} {services.length === 1 ? 'encontrado' : 'encontrados'}
        </Text>
      </View>
      <View style={[styles.onlineIndicator, { backgroundColor: '#22c55e' }]}>
        <View style={[styles.onlineDot, { backgroundColor: '#22c55e' }]} />
        <Text style={styles.onlineText}>AO VIVO</Text>
      </View>
    </View>
  );

  // List item
  const renderItem = ({ item }: { item: ServicoDisponivel }) => (
    <ServiceCard
      servico={item}
      isSelected={selectedServiceId === item.id}
      onSelect={() => onSelectService(item)}
      onExpand={() => onExpandService(item)}
      isDark={isDark}
    />
  );

  return (
    <View style={styles.container}>
      {renderHeader()}
      
      <FlatList
        data={services}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={loading}
              onRefresh={onRefresh}
              tintColor={THEME_COLORS.primary}
              colors={[THEME_COLORS.primary]}
            />
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerCount: {
    fontSize: 13,
    marginTop: 2,
  },
  onlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  onlineText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  listContent: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    marginTop: 12,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
  },
  errorMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
  },
  emptyMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
});
