/**
 * Courier integration interface. Only the ManualCourier exists today (the seller types the courier
 * name + tracking number); real couriers (TCS, Leopards, M&P...) plug in here later. No external calls.
 */
export type ShipmentInput = {
  orderNumber: string;
  courierName?: string;
  trackingNumber?: string;
  to: { fullName: string; phone: string; city: string; line1: string };
  codAmount: number;
};
export type Shipment = { courier: string; trackingNumber: string; labelUrl?: string };
export type TrackingEvent = { status: string; at: string; location?: string; note?: string };

export interface CourierProvider {
  readonly id: string;
  createShipment(input: ShipmentInput): Promise<Shipment>;
  track(trackingNumber: string): Promise<TrackingEvent[]>;
}

export class ManualCourier implements CourierProvider {
  readonly id = 'manual';

  async createShipment(input: ShipmentInput): Promise<Shipment> {
    const trackingNumber = input.trackingNumber?.trim();
    if (!trackingNumber) throw new Error('A tracking number is required for manual shipments');
    return { courier: input.courierName?.trim() || 'Manual', trackingNumber };
  }

  /** Manual shipments have no remote tracking; status lives on the order timeline. */
  async track(): Promise<TrackingEvent[]> {
    return [];
  }
}

const providers = new Map<string, CourierProvider>([['manual', new ManualCourier()]]);

export function getCourier(id = 'manual'): CourierProvider {
  return providers.get(id) ?? providers.get('manual')!;
}

/** Test / future hook. */
export function registerCourier(p: CourierProvider): void {
  providers.set(p.id, p);
}
