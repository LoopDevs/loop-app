import AsyncStorage from '@react-native-async-storage/async-storage';

import { CtxError } from '@/ctx/ctx-error';
import { paymentLock } from '@/ctx/payment-lock';
import { PaymentSender } from '@/ctx/payment-sender';
import { SentPayments } from '@/ctx/sent-payments';

export const sentPayments = new SentPayments(AsyncStorage);
export const paymentSender = new PaymentSender(sentPayments, CtxError.payRejectionOf, paymentLock);
