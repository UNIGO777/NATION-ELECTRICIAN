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
exports.adminDeleteUser = exports.processBillStatusChange = exports.notifyUserOnSchemeRequestDecision = exports.notifyAdminsOnSchemeRequest = exports.notifyAdminsOnBillUpload = void 0;
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const functions = __importStar(require("firebase-functions/v1"));
(0, app_1.initializeApp)();
const isAdminUid = async (params) => {
    const snap = await params.db.collection('User').doc(params.uid).get();
    if (!snap.exists)
        return false;
    const data = snap.data();
    const isAdmin = Boolean(data.isAdmin);
    if (isAdmin)
        return true;
    const role = typeof data.role === 'string' ? data.role.toLowerCase() : '';
    const userType = typeof data.userType === 'string' ? data.userType.toLowerCase() : '';
    return role === 'admin' || userType === 'admin';
};
const deleteDocIfExists = async (params) => {
    const ref = params.db.collection(params.collection).doc(params.id);
    const snap = await ref.get();
    if (!snap.exists)
        return 0;
    await ref.delete();
    return 1;
};
const deleteWhereUid = async (params) => {
    let total = 0;
    while (true) {
        const snap = await params.db.collection(params.collection).where('uid', '==', params.uid).limit(500).get();
        if (snap.empty)
            break;
        const batch = params.db.batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        total += snap.size;
        if (snap.size < 500)
            break;
    }
    return total;
};
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
exports.notifyAdminsOnSchemeRequest = functions.firestore
    .document('SchemeRequests/{requestId}')
    .onCreate(async (snap, context) => {
    const requestId = context.params.requestId;
    const req = snap.data();
    if (!requestId || !req)
        return;
    const db = (0, firestore_1.getFirestore)();
    const title = 'New Scheme Request';
    const schemeTitle = typeof req.schemeTitle === 'string' ? req.schemeTitle : 'Scheme';
    const rawCoins = typeof req.requiredCoins === 'number' ? req.requiredCoins : Number(req.requiredCoins);
    const requiredCoins = Number.isFinite(rawCoins) ? String(rawCoins) : '';
    const body = requiredCoins ? `${schemeTitle} • ${requiredCoins} coins` : schemeTitle;
    const requestUid = typeof req.uid === 'string' ? req.uid : '';
    const schemeId = typeof req.schemeId === 'string' ? req.schemeId : '';
    const createdAt = typeof req.createdAt === 'number' ? req.createdAt : Date.now();
    const adminUids = new Set();
    const adminsByFlag = await db.collection('User').where('isAdmin', '==', true).limit(50).get();
    adminsByFlag.docs.forEach((d) => {
        const data = d.data();
        const adminUid = typeof data.uid === 'string' && data.uid ? data.uid : d.id;
        if (adminUid)
            adminUids.add(adminUid);
    });
    if (adminUids.size === 0) {
        const adminsByRole = await db.collection('User').where('role', '==', 'admin').limit(50).get();
        adminsByRole.docs.forEach((d) => {
            const data = d.data();
            const adminUid = typeof data.uid === 'string' && data.uid ? data.uid : d.id;
            if (adminUid)
                adminUids.add(adminUid);
        });
    }
    await Promise.all(Array.from(adminUids).map((adminUid) => {
        const notificationId = `${adminUid}_${requestId}_scheme_request`;
        return db
            .collection('Notifications')
            .doc(notificationId)
            .set({
            uid: adminUid,
            schemeRequestId: requestId,
            schemeId,
            requestUid,
            title,
            body: `${requestUid || 'User'} requested "${schemeTitle}".`,
            type: 'scheme_request',
            createdAt,
            read: false,
        }, { merge: true });
    }));
    const tokensSnap = await db.collection('AdminFcmTokens').where('enabled', '==', true).get();
    const tokens = tokensSnap.docs
        .map((d) => (typeof d.data().token === 'string' ? d.data().token : d.id))
        .filter((t) => Boolean(t));
    if (!tokens.length)
        return;
    const response = await (0, messaging_1.getMessaging)().sendEachForMulticast({
        tokens: tokens.slice(0, 500),
        notification: { title, body },
        data: {
            type: 'scheme_request',
            schemeRequestId: requestId,
            schemeId,
            uid: requestUid,
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
exports.notifyUserOnSchemeRequestDecision = functions.firestore
    .document('SchemeRequests/{requestId}')
    .onUpdate(async (change, context) => {
    const requestId = context.params.requestId;
    const before = change.before.data();
    const after = change.after.data();
    if (!requestId || !before || !after)
        return;
    const beforeStatus = typeof before.status === 'string' ? String(before.status).toLowerCase() : 'pending';
    const afterStatus = typeof after.status === 'string' ? String(after.status).toLowerCase() : 'pending';
    if (beforeStatus === afterStatus)
        return;
    if (beforeStatus !== 'pending')
        return;
    if (afterStatus !== 'approved' && afterStatus !== 'rejected')
        return;
    const uid = typeof after.uid === 'string' ? after.uid : '';
    if (!uid)
        return;
    const db = (0, firestore_1.getFirestore)();
    const schemeTitle = typeof after.schemeTitle === 'string' ? after.schemeTitle : 'Scheme';
    const schemeId = typeof after.schemeId === 'string' ? after.schemeId : '';
    const rawCoins = typeof after.requiredCoins === 'number' ? after.requiredCoins : Number(after.requiredCoins);
    const requiredCoins = Number.isFinite(rawCoins) ? Math.max(0, Math.floor(rawCoins)) : 0;
    const title = afterStatus === 'approved' ? 'Scheme Request Approved' : 'Scheme Request Rejected';
    const body = afterStatus === 'approved'
        ? `"${schemeTitle}" has been approved. You will get call from our side in next seven days.`
        : `"${schemeTitle}" has been rejected. You will get call from our side in next seven days.`;
    const tokensSnap = await db.collection('UserFcmTokens').where('uid', '==', uid).where('enabled', '==', true).get();
    const tokens = tokensSnap.docs
        .map((d) => (typeof d.data().token === 'string' ? d.data().token : d.id))
        .filter((t) => Boolean(t));
    if (!tokens.length)
        return;
    const response = await (0, messaging_1.getMessaging)().sendEachForMulticast({
        tokens: tokens.slice(0, 500),
        notification: { title, body },
        data: {
            type: 'scheme_request_decision',
            decision: afterStatus,
            schemeRequestId: requestId,
            schemeId,
            requiredCoins: String(requiredCoins),
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
exports.adminDeleteUser = functions.https.onCall(async (data, context) => {
    const callerUid = context.auth?.uid ?? null;
    if (!callerUid) {
        throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
    }
    const targetUid = data?.uid;
    if (typeof targetUid !== 'string' || !targetUid.trim()) {
        throw new functions.https.HttpsError('invalid-argument', 'uid is required.');
    }
    if (targetUid === callerUid) {
        throw new functions.https.HttpsError('failed-precondition', 'You cannot delete your own account.');
    }
    const db = (0, firestore_1.getFirestore)();
    const allowed = await isAdminUid({ db, uid: callerUid });
    if (!allowed) {
        throw new functions.https.HttpsError('permission-denied', 'Only admin can delete users.');
    }
    const counts = {};
    counts.User = await deleteDocIfExists({ db, collection: 'User', id: targetUid });
    counts.Wallet = await deleteDocIfExists({ db, collection: 'Wallet', id: targetUid });
    const uidCollections = [
        'Bills',
        'ApprovedBills',
        'RejectedBills',
        'History',
        'Notifications',
        'SchemeRequests',
        'UserFcmTokens',
        'AdminFcmTokens',
    ];
    await Promise.all(uidCollections.map(async (collection) => {
        counts[collection] = await deleteWhereUid({ db, collection, uid: targetUid });
    }));
    let deletedAuth = false;
    let authError = null;
    try {
        await (0, auth_1.getAuth)().deleteUser(targetUid);
        deletedAuth = true;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to delete auth user.';
        authError = message;
    }
    return { ok: true, uid: targetUid, deletedAuth, authError, counts };
});
