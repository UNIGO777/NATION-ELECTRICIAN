"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.processBillStatusChange = exports.notifyAdminsOnBillUpload = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const functions = __importStar(require("firebase-functions/v1"));
(0, app_1.initializeApp)();
exports.notifyAdminsOnBillUpload = functions.firestore
    .document('Bills/{billId}')
    .onCreate(async (snap, context) => {
    const billId = context.params.billId;
    const bill = snap.data();
    if (!billId || !bill)
        return;
    const db = (0, firestore_1.getFirestore)();
    const tokensSnap = await db.collection('AdminFcmTokens').where('enabled', '==', true).get();
    const tokens = tokensSnap.docs
        .map((d) => (typeof d.data().token === 'string' ? d.data().token : d.id))
        .filter((t) => Boolean(t));
    if (!tokens.length)
        return;
    const title = 'New Bill Uploaded';
    const body = `Bill ID: ${billId}`;
    const response = await (0, messaging_1.getMessaging)().sendEachForMulticast({
        tokens: tokens.slice(0, 500),
        notification: { title, body },
        data: {
            type: 'bill_uploaded',
            billId,
            uid: String(bill.uid ?? ''),
        },
        android: { priority: 'high' },
        apns: { headers: { 'apns-priority': '10' } },
    });
    const invalidTokens = [];
    response.responses.forEach((r, idx) => {
        if (r.success)
            return;
        const code = r.error?.code ?? '';
        if (code.includes('registration-token-not-registered') ||
            code.includes('invalid-argument') ||
            code.includes('messaging/invalid-registration-token')) {
            invalidTokens.push(tokens[idx]);
        }
    });
    await Promise.all(invalidTokens.map((token) => db
        .collection('AdminFcmTokens')
        .doc(token)
        .delete()
        .catch(() => null)));
});
exports.processBillStatusChange = functions.firestore
    .document('Bills/{billId}')
    .onUpdate(async (change, context) => {
    const billId = context.params.billId;
    const before = change.before.data();
    const after = change.after.data();
    if (!billId || !before || !after)
        return;
    const beforeStatus = typeof before.status === 'string' ? before.status : 'pending';
    const afterStatus = typeof after.status === 'string' ? after.status : 'pending';
    if (beforeStatus === afterStatus)
        return;
    if (beforeStatus !== 'pending')
        return;
    if (afterStatus !== 'approved' && afterStatus !== 'rejected')
        return;
    const db = (0, firestore_1.getFirestore)();
    const uid = typeof after.uid === 'string' ? after.uid : '';
    const now = Date.now();
    const decidedBy = typeof after.decidedBy === 'string' ? after.decidedBy : '';
    let coins = 0;
    if (afterStatus === 'approved') {
        const rawCoins = typeof after.approvedCoins === 'number' ? after.approvedCoins : Number(after.approvedCoins);
        coins = Number.isFinite(rawCoins) ? Math.max(0, Math.floor(rawCoins)) : 0;
        const approvedRef = db.collection('ApprovedBills').doc(billId);
        const approvedSnap = await approvedRef.get();
        if (approvedSnap.exists)
            return;
        await approvedRef.set({
            billId,
            uid,
            coins,
            decidedBy: decidedBy || null,
            createdAt: now,
        }, { merge: true });
        if (uid && coins > 0) {
            await db
                .collection('Wallet')
                .doc(uid)
                .set({
                uid,
                coins: firestore_1.FieldValue.increment(coins),
                updatedAt: now,
            }, { merge: true });
            await db.collection('History').add({
                uid,
                title: 'Bill Approved',
                type: 'bill_approved',
                coinsDelta: coins,
                createdAt: now,
                billId,
            });
        }
        if (uid) {
            const notificationId = `${uid}_${billId}_approved`;
            const notificationRef = db.collection('Notifications').doc(notificationId);
            const notificationSnap = await notificationRef.get();
            if (!notificationSnap.exists) {
                await notificationRef.set({
                    uid,
                    billId,
                    title: 'Bill Approved',
                    body: `You received ${coins} coins.`,
                    type: 'bill_approved',
                    coins,
                    decidedBy: decidedBy || null,
                    createdAt: now,
                    read: false,
                }, { merge: true });
            }
        }
    }
    else {
        const rejectedRef = db.collection('RejectedBills').doc(billId);
        const rejectedSnap = await rejectedRef.get();
        if (rejectedSnap.exists)
            return;
        await rejectedRef.set({
            billId,
            uid,
            decidedBy: decidedBy || null,
            createdAt: now,
        }, { merge: true });
        if (uid) {
            await db.collection('History').add({
                uid,
                title: 'Bill Rejected',
                type: 'bill_rejected',
                coinsDelta: 0,
                createdAt: now,
                billId,
            });
            const notificationId = `${uid}_${billId}_rejected`;
            const notificationRef = db.collection('Notifications').doc(notificationId);
            const notificationSnap = await notificationRef.get();
            if (!notificationSnap.exists) {
                await notificationRef.set({
                    uid,
                    billId,
                    title: 'Bill Rejected',
                    body: 'Your bill was rejected.',
                    type: 'bill_rejected',
                    coins: 0,
                    decidedBy: decidedBy || null,
                    createdAt: now,
                    read: false,
                }, { merge: true });
            }
        }
    }
    if (!uid)
        return;
    const tokensSnap = await db.collection('UserFcmTokens').where('uid', '==', uid).where('enabled', '==', true).get();
    const tokens = tokensSnap.docs
        .map((d) => (typeof d.data().token === 'string' ? d.data().token : d.id))
        .filter((t) => Boolean(t));
    if (!tokens.length)
        return;
    const title = afterStatus === 'approved' ? 'Bill Approved' : 'Bill Rejected';
    const body = afterStatus === 'approved' ? `You received ${coins} coins.` : 'Your bill was rejected.';
    const response = await (0, messaging_1.getMessaging)().sendEachForMulticast({
        tokens: tokens.slice(0, 500),
        notification: { title, body },
        data: {
            type: 'bill_decision',
            decision: afterStatus,
            billId,
            coins: String(coins),
        },
        android: { priority: 'high' },
        apns: { headers: { 'apns-priority': '10' } },
    });
    const invalidTokens = [];
    response.responses.forEach((r, idx) => {
        if (r.success)
            return;
        const code = r.error?.code ?? '';
        if (code.includes('registration-token-not-registered') ||
            code.includes('invalid-argument') ||
            code.includes('messaging/invalid-registration-token')) {
            invalidTokens.push(tokens[idx]);
        }
    });
    await Promise.all(invalidTokens.map((token) => db
        .collection('UserFcmTokens')
        .doc(token)
        .delete()
        .catch(() => null)));
});
