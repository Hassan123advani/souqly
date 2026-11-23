import {
  PERMISSIONS,
  adminTicketAssignSchema,
  adminTicketListQuerySchema,
  adminTicketStatusSchema,
  cursorQuerySchema,
  objectIdSchema,
  ticketCreateSchema,
  ticketMessageSchema,
} from '@souqly/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { AppError, notFound } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { can, iso, oid, q } from '../admin/common';
import { audit } from '../audit/audit.service';
import { notify } from '../notifications/notification.service';
import { Order } from '../orders/order.model';
import { User } from '../users/user.model';
import { Ticket, type TicketLean } from './ticket.model';

/** Buyer support tickets: /api/v1/support/tickets */
export const supportRouter = Router();
/** Admin support desk (mounted at /api/v1/admin). */
export const adminSupportRouter = Router();
const idParams = z.object({ id: objectIdSchema });
/** A user can have at most this many open/pending tickets (spam guard). */
export const MAX_OPEN_TICKETS = 10;

function ticketDTO(t: TicketLean, view: 'user' | 'staff', names: Map<string, string> = new Map()) {
  return {
    id: String(t._id),
    subject: t.subject,
    category: t.category,
    priority: t.priority,
    status: t.status,
    orderId: t.orderId ? String(t.orderId) : null,
    messages: t.messages.map((m) => ({
      side: m.side,
      body: m.body,
      attachments: m.attachments.map((a) => ({ url: a.url })),
      at: iso(m.at),
      // Buyers see "Souqly Support", never the staff member's identity.
      author: m.side === 'staff' && view === 'user' ? 'Souqly Support' : (names.get(String(m.authorId)) ?? null),
      ...(view === 'staff' ? { authorId: String(m.authorId) } : {}),
    })),
    ...(view === 'staff' ? { userId: String(t.userId), assigneeId: t.assigneeId ? String(t.assigneeId) : null } : {}),
    lastMessageAt: iso(t.lastMessageAt),
    createdAt: iso(t.createdAt),
  };
}

const summary = (t: TicketLean, view: 'user' | 'staff') => {
  const { messages, ...rest } = ticketDTO({ ...t, messages: [] }, view);
  void messages;
  return { ...rest, messageCount: t.messages.length, lastSide: t.messages[t.messages.length - 1]?.side ?? null };
};

// ---------------- buyer ----------------
supportRouter.use(requireAuth);

supportRouter.post(
  '/tickets',
  validate({ body: ticketCreateSchema }),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof ticketCreateSchema>;
    const userId = oid(req.user!.id);
    if ((await Ticket.countDocuments({ userId, status: { $in: ['open', 'pending'] } })) >= MAX_OPEN_TICKETS) {
      throw new AppError(429, 'TOO_MANY_TICKETS', 'You have too many open tickets. Please wait for a reply.');
    }
    let orderId;
    if (b.orderNumber) {
      const o = await Order.findOne({ number: b.orderNumber, buyerId: userId }).select('_id').lean();
      if (!o) throw new AppError(400, 'ORDER_NOT_FOUND', 'We could not find that order in your account');
      orderId = o._id;
    }
    const t = await Ticket.create({
      userId,
      subject: b.subject,
      category: b.category,
      ...(orderId ? { orderId } : {}),
      messages: [{ authorId: userId, side: 'user', body: b.body, attachments: [], at: new Date() }],
    });
    await audit({ action: 'support.ticket_created', targetType: 'Ticket', targetId: t._id, req });
    res.status(201).json({ data: ticketDTO(t.toObject() as TicketLean, 'user') });
  }),
);

supportRouter.get(
  '/tickets',
  validate({ query: cursorQuerySchema }),
  asyncHandler(async (req, res) => {
    const f = req.query as unknown as z.infer<typeof cursorQuerySchema>;
    const rows = await Ticket.find({ userId: oid(req.user!.id), ...cursorFilter('_id', -1, f.cursor) }).sort(cursorSort('_id', -1)).limit(f.limit + 1).lean<TicketLean[]>();
    const page = paginate(rows, f.limit, '_id');
    res.json({ data: page.items.map((t) => summary(t, 'user')), meta: { nextCursor: page.nextCursor } });
  }),
);

supportRouter.get(
  '/tickets/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const t = await Ticket.findOne({ _id: oid(req.params.id!), userId: oid(req.user!.id) }).lean<TicketLean>();
    if (!t) throw notFound('Ticket');
    res.json({ data: ticketDTO(t, 'user') });
  }),
);

supportRouter.post(
  '/tickets/:id/messages',
  validate({ params: idParams, body: ticketMessageSchema }),
  asyncHandler(async (req, res) => {
    const userId = oid(req.user!.id);
    // Replying re-opens a resolved ticket; closed tickets stay closed.
    const t = await Ticket.findOneAndUpdate(
      { _id: oid(req.params.id!), userId, status: { $ne: 'closed' }, 'messages.199': { $exists: false } },
      { $push: { messages: { authorId: userId, side: 'user', body: req.body.body, attachments: [], at: new Date() } }, $set: { status: 'open', lastMessageAt: new Date() } },
      { new: true },
    ).lean<TicketLean>();
    if (!t) {
      if (!(await Ticket.exists({ _id: oid(req.params.id!), userId }))) throw notFound('Ticket');
      throw new AppError(409, 'TICKET_CLOSED', 'This ticket is closed. Please open a new one.');
    }
    if (t.assigneeId) void notify({ userId: t.assigneeId, type: 'support.user_reply', title: 'New reply on a ticket', body: t.subject, link: `/admin/support/${String(t._id)}` });
    res.status(201).json({ data: ticketDTO(t, 'user') });
  }),
);

// ---------------- admin ----------------
const SUPPORT = PERMISSIONS.ADMIN_SUPPORT_MANAGE;
type TicketQuery = z.infer<typeof adminTicketListQuerySchema>;

adminSupportRouter.get(
  '/tickets',
  ...can(SUPPORT),
  validate({ query: adminTicketListQuerySchema }),
  asyncHandler(async (req, res) => {
    const f = q<TicketQuery>(req);
    const filter: Record<string, unknown> = {};
    if (f.status) filter.status = f.status;
    if (f.priority) filter.priority = f.priority;
    if (f.assigneeId === 'me') filter.assigneeId = oid(req.user!.id);
    else if (f.assigneeId === 'none') filter.assigneeId = null;
    else if (f.assigneeId) filter.assigneeId = oid(f.assigneeId);
    const rows = await Ticket.find({ ...filter, ...cursorFilter('_id', -1, f.cursor) }).sort(cursorSort('_id', -1)).limit(f.limit + 1).lean<TicketLean[]>();
    const page = paginate(rows, f.limit, '_id');
    res.json({ data: page.items.map((t) => summary(t, 'staff')), meta: { nextCursor: page.nextCursor } });
  }),
);

async function staffNames(t: TicketLean) {
  const ids = [...new Set(t.messages.map((m) => String(m.authorId)))];
  const users = await User.find({ _id: { $in: ids.map(oid) } }).select('name').lean();
  return new Map(users.map((u) => [String(u._id), u.name]));
}

adminSupportRouter.get(
  '/tickets/:id',
  ...can(SUPPORT),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const t = await Ticket.findById(req.params.id).lean<TicketLean>();
    if (!t) throw notFound('Ticket');
    const user = await User.findById(t.userId).select('name email').lean();
    res.json({ data: { ...ticketDTO(t, 'staff', await staffNames(t)), user: user ? { id: String(user._id), name: user.name, email: user.email ?? null } : null } });
  }),
);

async function updateTicket(req: Request, update: Record<string, unknown>, action: string, meta: Record<string, unknown> = {}) {
  const t = await Ticket.findByIdAndUpdate(req.params.id, update, { new: true }).lean<TicketLean>();
  if (!t) throw notFound('Ticket');
  await audit({ action, targetType: 'Ticket', targetId: t._id, meta, req });
  return t;
}

adminSupportRouter.post(
  '/tickets/:id/assign',
  ...can(SUPPORT),
  validate({ params: idParams, body: adminTicketAssignSchema }),
  asyncHandler(async (req, res) => {
    const assigneeId = req.body.assigneeId as string | null;
    if (assigneeId) {
      const staff = await User.findOne({ _id: oid(assigneeId), platformRole: { $exists: true }, status: 'active' }).select('_id').lean();
      if (!staff) throw new AppError(400, 'NOT_STAFF', 'Tickets can only be assigned to active staff');
    }
    const t = await updateTicket(req, { $set: { assigneeId: assigneeId ? oid(assigneeId) : null } }, 'admin.ticket_assigned', { assigneeId });
    res.json({ data: summary(t, 'staff') });
  }),
);

adminSupportRouter.post(
  '/tickets/:id/reply',
  ...can(SUPPORT),
  validate({ params: idParams, body: ticketMessageSchema }),
  asyncHandler(async (req, res) => {
    const me = oid(req.user!.id);
    const t = await Ticket.findOneAndUpdate(
      { _id: oid(req.params.id!), status: { $ne: 'closed' } },
      {
        $push: { messages: { authorId: me, side: 'staff', body: req.body.body, attachments: [], at: new Date() } },
        // A staff reply waits on the user; first responder becomes the assignee.
        $set: { status: 'pending', lastMessageAt: new Date() },
      },
      { new: true },
    ).lean<TicketLean>();
    if (!t) {
      if (!(await Ticket.exists({ _id: oid(req.params.id!) }))) throw notFound('Ticket');
      throw new AppError(409, 'TICKET_CLOSED', 'This ticket is closed');
    }
    if (!t.assigneeId) await Ticket.updateOne({ _id: t._id, assigneeId: null }, { $set: { assigneeId: me } });
    await audit({ action: 'admin.ticket_replied', targetType: 'Ticket', targetId: t._id, req });
    void notify({ userId: t.userId, type: 'support.reply', title: 'Souqly Support replied', body: t.subject, link: `/account/support/${String(t._id)}` });
    res.status(201).json({ data: ticketDTO(t, 'staff', await staffNames(t)) });
  }),
);

adminSupportRouter.patch(
  '/tickets/:id',
  ...can(SUPPORT),
  validate({ params: idParams, body: adminTicketStatusSchema }),
  asyncHandler(async (req, res) => {
    const set: Record<string, unknown> = {};
    if (req.body.status) set.status = req.body.status;
    if (req.body.priority) set.priority = req.body.priority;
    if (!Object.keys(set).length) throw new AppError(400, 'NOTHING_TO_UPDATE', 'Send a status or priority');
    const t = await updateTicket(req, { $set: set }, 'admin.ticket_updated', set);
    res.json({ data: summary(t, 'staff') });
  }),
);
