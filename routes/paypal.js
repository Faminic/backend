const moment = require('moment');
const router = require('express').Router();
const paypal = require('../paypalAPI.js');
const calendar = require('../calendarAPI.js');
const utils = require('../utils.js');


// Paypal Lock schema
// Start/End <=> timeslot
// Summary: venue
// Description: {
//   "token": "...",
//   "payment_id": "...",
//   "details": {
//     "name": "...",
//     "phone_number": "..."
//   }
// }


router.get('/ok', (req, res) => {
    // expect token, paymentId, and PayerID.
    const { paymentId, PayerID, token } = req.query;
    if (!(paymentId && PayerID && token)) {
        res.status(403);
        res.end();
        return;
    }

    const today = moment().startOf('day');
    calendar.findLock(calendar.auth, {
        start: utils.momentToCalendarDate(today),
        end:   utils.momentToCalendarDate(today.add(1, 'month')),
        predicate: (_, d) => d.token === token && d.payment_id == paymentId,
    }, (err, event) => {
        // make sure that the lock still exists and isn't
        // already deleted.
        if (!event) {
            res.status(404);
            res.end();
            return;
        }
        console.log(event);
        const desc = JSON.parse(event.description);
        paypal.execute_payment(paymentId, PayerID, (err, payment) => {
            // delete paypal lock from calendar
            calendar.deleteLock(calendar.auth, event.id, (err) => err && console.error(err));
            if (err) throw err;
            calendar.addSlot(
                calendar.ids[event.summary],
                calendar.auth,
                {
                    start: event.start,
                    end:   event.end,
                    summary: event.summary,
                    description: `Name: ${desc.details.name}\nPhone Number: ${desc.details.phone_number}`
                },
                (err, resource) => {
                    if (err) throw err;
                    console.log(resource);
                    res.write("Payment approved.");
                    res.end();
                }
            );
        });
    });
});


router.get('/cancel', (req, res) => {
    // expect token
    const {token} = req.query;
    if (!token) {
        res.status(403);
        res.end();
        return;
    }
    // find + delete paypal lock from calendar
    const today = moment().startOf('day');
    calendar.findLock(calendar.auth, {
        start: utils.momentToCalendarDate(today),
        end:   utils.momentToCalendarDate(today.add(1, 'month')),
        predicate: (_, d) => d.token === token,
    }, (err, event) => {
        if (event) {
            calendar.deleteLock(calendar.auth, event.id, (err) => err && console.error(err));
        }
        res.write("Payment cancelled");
        res.end();
    });
});


router.get('/payment-demo', (req, res) => {
    paypal.create_payment("Sample Item Name", "10.00", (err, payment, info) => {
        if (err) throw err;
        console.log(payment);
        calendar.addLock(calendar.auth, {
            start:   utils.momentToCalendarDate(moment()),
            end:     utils.momentToCalendarDate(moment().add(2, 'hours')),
            summary: 'football_field',
            description: JSON.stringify({
                token: info.token,
                payment_id: payment.id,
                details: {
                    name: "anikan",
                    phone_number: "123123",
                }
            }),
        }, (err) => {
            if (err) throw err;
            res.redirect(info.redirect);
        });
    });
});


module.exports = router;
