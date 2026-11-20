import type { OperatorName, WarehouseState } from '../types/warehouse';

export const ALLOWED_OPERATORS: readonly OperatorName[] = ['محمد رضا', 'ملك عيد'];

export function createInitialWarehouseState(): WarehouseState {
  return {
    settings: {
      warehouseName: 'إدارة مخزن الدولية',
      warehouseSubtitle: 'مخزن إكسسوارات الملابس',
      stationId: 'WH-INTL-01',
      capacity: 60000,
      defaultMinThreshold: 200,
      whatsappNumber: '+20 11 04155183',
      aisles: ['ممر A — أزرار وكباسين', 'ممر B — سوست وسحابات', 'ممر C — خيوط وأستك', 'ممر D — تيكت ودانتيل'],
      categories: [
        'أزرار',
        'سوست وسحابات',
        'خيوط خياطة',
        'أستك ومطاط',
        'تيكت ومقاسات',
        'كباسين معدنية',
        'دانتيل وكلف',
        'فازلين وحشو',
      ],
      supabaseUrl: '',
      supabaseAnonKey: '',
    },
    users: [],
    // Clean empty warehouse slate — zero pre-populated accessories, customers, or movements
    items: [],
    customers: [],
    allocations: [],
    movements: [],
  };
}
