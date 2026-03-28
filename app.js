document.addEventListener('DOMContentLoaded', function () {

    // ── Tax brackets (YA2024+) ────────────────────────────────────────────────
    var brackets = [
        { from: 0,       to: 20000,    rate: 0.000, base: 0      },
        { from: 20000,   to: 30000,    rate: 0.020, base: 0      },
        { from: 30000,   to: 40000,    rate: 0.035, base: 200    },
        { from: 40000,   to: 80000,    rate: 0.070, base: 550    },
        { from: 80000,   to: 120000,   rate: 0.115, base: 3350   },
        { from: 120000,  to: 160000,   rate: 0.150, base: 7950   },
        { from: 160000,  to: 200000,   rate: 0.180, base: 13950  },
        { from: 200000,  to: 240000,   rate: 0.190, base: 21150  },
        { from: 240000,  to: 280000,   rate: 0.195, base: 28750  },
        { from: 280000,  to: 320000,   rate: 0.200, base: 36550  },
        { from: 320000,  to: 500000,   rate: 0.220, base: 44550  },
        { from: 500000,  to: 1000000,  rate: 0.230, base: 84150  },
        { from: 1000000, to: Infinity, rate: 0.240, base: 199150 }
    ];

    function calculateTax(income) {
        if (income <= 0) return 0;
        for (var i = 0; i < brackets.length; i++) {
            if (income <= brackets[i].to) {
                return brackets[i].base + (income - brackets[i].from) * brackets[i].rate;
            }
        }
        // Should never be reached — last bracket covers Infinity
        throw new Error('calculateTax: income ' + income + ' not covered by any bracket');
    }

    // ── CPF employee contribution rates 2025 (income year for YA 2026) ────────
    // Key: age group → employee contribution rate on OW/AW
    var cpfEmployeeRates = {
        'u55':   0.20,
        '55to60': 0.17,
        '60to65': 0.115,
        '65to70': 0.075,
        'o70':   0.05
    };

    // OW ceiling (2025): $7,400/month
    // Annual salary ceiling: $102,000
    var OW_CEILING_MONTHLY = 7400;
    var ANNUAL_SALARY_CEILING = 102000;

    /**
     * Estimate employee CPF relief.
     *
     * CPF relief = employee contributions on OW (capped at OW ceiling) +
     *              employee contributions on AW (capped at AW ceiling)
     *
     * OW ceiling = $7,400/month
     * AW ceiling = $102,000 − total OW subject to CPF for the year
     *
     * Total contributions capped at Annual Limit ($37,740) as relief cap.
     *
     * @param {number} annualMonthly  Monthly ordinary wage (before CPF)
     * @param {number} annualBonus    Total bonus / additional wages for the year
     * @param {string} ageGroup       CPF age group key
     */
    function estimateCpfRelief(annualMonthly, annualBonus, ageGroup) {
        var rate = cpfEmployeeRates[ageGroup] || 0.20;

        // OW subject to CPF per month (capped at OW ceiling)
        var owPerMonth = Math.min(annualMonthly, OW_CEILING_MONTHLY);
        // Total OW subject to CPF for the year
        var totalOWSubjectToCPF = owPerMonth * 12;

        // AW ceiling = annual salary ceiling − total OW subject to CPF
        var awCeiling = Math.max(0, ANNUAL_SALARY_CEILING - totalOWSubjectToCPF);
        var awSubjectToCPF = Math.min(annualBonus, awCeiling);

        var cpfOnOW = totalOWSubjectToCPF * rate;
        var cpfOnAW = awSubjectToCPF * rate;

        // Total capped at annual limit ($37,740)
        var total = Math.min(cpfOnOW + cpfOnAW, 37740);

        return { onOW: cpfOnOW, onAW: cpfOnAW, total: total };
    }

    // ── Formatters ────────────────────────────────────────────────────────────
    var fmtOpts2dp = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    var fmtOpts1dp = { minimumFractionDigits: 0, maximumFractionDigits: 1 };

    function fmt(n) { return '$' + Math.max(0, n).toLocaleString('en-SG', fmtOpts2dp); }
    function fmtShort(n) {
        return n >= 1000
            ? '$' + (n / 1000).toLocaleString('en-SG', fmtOpts1dp) + 'k'
            : '$' + Math.round(n).toLocaleString('en-SG');
    }

    // ── DOM helpers ───────────────────────────────────────────────────────────
    function $(id) { return document.getElementById(id); }
    function val(id) { var el = $(id); if (!el) return 0; var v = parseFloat(el.value); return (isNaN(v) || v < 0) ? 0 : v; }
    function setText(id, text) { var el = $(id); if (el) el.textContent = text; }
    function toggleClass(el, cls, force) { if (el) el.classList.toggle(cls, force); }
    function getRadio(name) { var el = document.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : ''; }

    // ── State ─────────────────────────────────────────────────────────────────
    var employInputMode = 'annual';
    var rentalDeemedMode = true;
    var reliefMode = 'detailed';
    var cpfMode = 'calc'; // 'calc' or 'custom'

    var incomeState = { grossEmploy: 0, annualOW: 0, annualAW: 0, employ: 0, rental: 0, trade: 0, other: 0 };
    var reliefState = {
        eir: 0, spouse: 0, qcr: 0, wmcr: 0, parent: 0, gcr: 0,
        sibling: 0, cpf: 0, lifeIns: 0, topup: 0, srs: 0, nsman: 0,
        total: 0, capped: 0, donations: 0, ptr: 0, simpleMode: false, simpleRaw: 0
    };

    // ── GIRO instalment helper ────────────────────────────────────────────────
    function calcGiroMonths(tax) {
        if (tax <= 0) return { months: 0, monthly: 0 };
        var months = Math.min(12, Math.floor(tax / 20));
        if (months <= 1) return { months: 1, monthly: tax };
        return { months: months, monthly: tax / months };
    }

    // ── Tab indicators ──────────────────────────────────────────────────────
    function updateTabIndicators() {
        var s = incomeState;
        var r = reliefState;

        // Tab done dots — income tab gets dot if any income entered
        var hasIncome = (s.grossEmploy > 0 || s.rental > 0 || s.trade > 0 || s.other > 0);
        var dotIncome = $('dot-income');
        if (dotIncome) dotIncome.style.display = hasIncome ? 'inline-block' : 'none';

        // Reliefs tab gets dot if any relief or donation entered
        var hasRelief = (r.donations > 0 || r.capped > 0 || r.ptr > 0);
        var dotReliefs = $('dot-reliefs');
        if (dotReliefs) dotReliefs.style.display = hasRelief ? 'inline-block' : 'none';
    }


    function switchTab(tab) {
        document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
        document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
        $('page-' + tab).classList.add('active');
        $('tab-' + tab).classList.add('active');
        if (tab === 'result') updateResults();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    $('tab-income').addEventListener('click',  function() { switchTab('income');  });
    $('tab-reliefs').addEventListener('click', function() { switchTab('reliefs'); });
    $('tab-result').addEventListener('click',  function() { switchTab('result');  });
    $('btnContinueToReliefs').addEventListener('click', function() { switchTab('reliefs'); });
    $('btnViewResults').addEventListener('click',       function() { switchTab('result');  });

    // ── Income card toggles ───────────────────────────────────────────────────
    ['employment', 'rental', 'trade', 'other'].forEach(function(key) {
        $('incomeCardHeader-' + key).addEventListener('click', function() {
            $('incomeCard-' + key).classList.toggle('open');
        });
    });

    // ── Employment input mode ─────────────────────────────────────────────────
    function setEmployInputMode(mode) {
        employInputMode = mode;
        toggleClass($('employModeAnnual'),    'active', mode === 'annual');
        toggleClass($('employModeMonthly'),   'active', mode === 'monthly');
        toggleClass($('employAnnualSection'), 'hidden', mode !== 'annual');
        toggleClass($('employMonthlySection'),'hidden', mode === 'annual');
        calcIncome();
    }
    $('employModeAnnual').addEventListener('click',  function() { setEmployInputMode('annual');  });
    $('employModeMonthly').addEventListener('click', function() { setEmployInputMode('monthly'); });

    // ── Relief mode ───────────────────────────────────────────────────────────
    function setReliefMode(mode) {
        reliefMode = mode;
        toggleClass($('reliefModeSimpleBtn'),   'active', mode === 'simple');
        toggleClass($('reliefModeDetailedBtn'), 'active', mode === 'detailed');
        toggleClass($('reliefSimpleSection'),   'hidden', mode !== 'simple');
        toggleClass($('reliefDetailedSection'), 'hidden', mode !== 'detailed');
        calcReliefs();
    }
    $('reliefModeSimpleBtn').addEventListener('click',   function() { setReliefMode('simple');   });
    $('reliefModeDetailedBtn').addEventListener('click', function() { setReliefMode('detailed'); });

    // ── CPF mode ──────────────────────────────────────────────────────────────
    function setCpfMode(mode) {
        cpfMode = mode;
        toggleClass($('cpfModeCalcBtn'),   'active', mode === 'calc');
        toggleClass($('cpfModeCustomBtn'), 'active', mode === 'custom');
        toggleClass($('cpfCalcSection'),   'hidden', mode !== 'calc');
        toggleClass($('cpfCustomSection'), 'hidden', mode === 'calc');
        calcReliefs();
    }
    $('cpfModeCalcBtn').addEventListener('click',   function() { setCpfMode('calc');   });
    $('cpfModeCustomBtn').addEventListener('click', function() { setCpfMode('custom'); });

    // ── Rental toggle ─────────────────────────────────────────────────────────
    $('rentalDeemedToggle').addEventListener('change', function() {
        rentalDeemedMode = this.checked;
        toggleClass($('rentalDeemedSection'), 'hidden', !rentalDeemedMode);
        toggleClass($('rentalActualSection'), 'hidden',  rentalDeemedMode);
        calcIncome();
    });

    // ── Relief section accordions ─────────────────────────────────────────────
    var reliefSectionIds = [
        'rs-donations', 'rs-eir', 'rs-spouse', 'rs-qcr', 'rs-wmcr',
        'rs-parent', 'rs-gcr', 'rs-sibling', 'rs-cpf', 'rs-lifeins',
        'rs-topup', 'rs-srs', 'rs-nsman', 'rs-ptr'
    ];
    reliefSectionIds.forEach(function(id) {
        var header = $(id + '-header');
        if (header) header.addEventListener('click', function() { $(id).classList.toggle('open'); });
    });

    // ── Reset button ───────────────────────────────────────────────────────
    var resetModal = $('resetModal');
    var tabResetBtn = $('tab-reset');
    if (tabResetBtn) {
        tabResetBtn.addEventListener('click', function() {
            resetModal.style.display = 'flex';
        });
    }
    $('resetCancelBtn').addEventListener('click', function() {
        resetModal.style.display = 'none';
    });
    resetModal.addEventListener('click', function(e) {
        if (e.target === resetModal) resetModal.style.display = 'none';
    });
    $('resetConfirmBtn').addEventListener('click', function() {
        // Clear all number inputs
        document.querySelectorAll('input[type="number"]').forEach(function(el) {
            el.value = '';
        });
        // Reset all radio buttons to their first (default) option
        var radioGroups = {};
        document.querySelectorAll('input[type="radio"]').forEach(function(r) {
            if (!radioGroups[r.name]) {
                radioGroups[r.name] = true;
                r.checked = true;
            } else {
                r.checked = false;
            }
        });
        // Reset all radio highlights
        document.querySelectorAll('.radio-option').forEach(function(opt) {
            opt.classList.remove('selected');
        });
        document.querySelectorAll('.radio-option input[type="radio"]:checked').forEach(function(r) {
            r.closest('.radio-option').classList.add('selected');
        });
        // Reset checkboxes to default (checked = true for rentalDeemedToggle)
        var rtd = $('rentalDeemedToggle');
        if (rtd) { rtd.checked = true; rentalDeemedMode = true; }
        toggleClass($('rentalDeemedSection'), 'hidden', false);
        toggleClass($('rentalActualSection'), 'hidden', true);
        // Reset input mode toggles to their defaults
        setEmployInputMode('annual');
        setReliefMode('detailed');
        setCpfMode('calc');
        // Reset NSman disabled states
        setGroupDisabled('nsmanWifeGroup', false);
        setGroupDisabled('nsmanSelfGroup', false);
        // Close modal and recalculate
        resetModal.style.display = 'none';
        switchTab('income');
        calcIncome();
    });


    // ── Income summary badges ─────────────────────────────────────────────────
    function updateIncomeSummary(summaryId, netAmt, hasData, emptyText) {
        var el = $(summaryId);
        if (!el) return;
        if (hasData) {
            el.innerHTML = 'Net income: <span class="net-val">' + fmt(netAmt) + '</span>';
        } else {
            el.textContent = emptyText;
        }
    }

    // ── Income calculation ────────────────────────────────────────────────────
    function calcIncome() {
        // Employment
        var monthly = val('employMonthlyIncome');
        var bonusMonths = val('employBonusMonths');

        var annualOW, annualAW, grossEmploy;
        if (employInputMode === 'annual') {
            annualOW   = val('employAnnualIncome');
            annualAW   = val('employAnnualBonus');
            grossEmploy = annualOW + annualAW;
        } else {
            annualOW   = monthly * 12;
            annualAW   = monthly * bonusMonths;
            grossEmploy = annualOW + annualAW;
        }

        var employExpenses = val('employExpenses');
        var netEmploy = Math.max(0, grossEmploy - employExpenses);
        setText('employGrossAnnual', fmt(grossEmploy));
        setText('netEmployIncome', fmt(netEmploy));

        // Rental
        var rentalGross = val('rentalGross');
        var rentalMortgageInterest = val('rentalMortgageInterest'); // only in deemed mode
        var rentalExp = rentalDeemedMode
            ? rentalGross * 0.15 + rentalMortgageInterest
            : val('rentalActualExpenses');
        var netRental = Math.max(0, rentalGross - rentalExp);
        setText('rentalDeemedExpenses', fmt(rentalGross * 0.15));
        setText('netRentalIncome', fmt(netRental));

        // Trade
        var tradeGross = val('tradeGross');
        var tradeExp = val('tradeExpenses');
        var netTrade = Math.max(0, tradeGross - tradeExp);
        setText('netTradeIncome', fmt(netTrade));

        // Other
        var totalOther = val('otherDividends') + val('otherInterest') + val('otherRoyalty') + val('otherGains');
        setText('totalOtherIncome', fmt(totalOther));

        // Update summaries
        updateIncomeSummary('employSummary', netEmploy, grossEmploy > 0, 'Enter your employment earnings');
        updateIncomeSummary('rentalSummary', netRental, rentalGross > 0, 'Enter your property rental earnings');
        updateIncomeSummary('tradeSummary', netTrade, tradeGross > 0, 'Enter your self-employment / business earnings');

        // Other income uses "Total income" label (passive income, no expenses deducted)
        var otherEl = $('otherSummary');
        if (otherEl) {
            if (totalOther > 0) {
                otherEl.innerHTML = 'Total income: <span class="net-val">' + fmt(totalOther) + '</span>';
            } else {
                otherEl.textContent = 'Dividends, interest, royalties and other gains';
            }
        }

        // Store grossEmploy for EIR cap, and OW/AW separately for CPF calc
        incomeState = { grossEmploy: grossEmploy, annualOW: annualOW, annualAW: annualAW, employ: netEmploy, rental: netRental, trade: netTrade, other: totalOther };
        calcReliefs();
    }

    // ── NSman helpers ─────────────────────────────────────────────────────────
    function setGroupDisabled(groupId, disabled) {
        var group = $(groupId);
        if (!group) return;
        group.querySelectorAll('.radio-option').forEach(function(opt) {
            var radio = opt.querySelector('input[type="radio"]');
            var isReset = radio && (radio.value === 'none' || radio.value === 'no');
            toggleClass(opt, 'disabled', disabled && !isReset);
        });
    }
    function syncRadioHighlights(name) {
        document.querySelectorAll('input[name="' + name + '"]').forEach(function(r) {
            r.closest('.radio-option').classList.toggle('selected', r.checked);
        });
    }
    function onNsmanSelfChange() {
        var selfActive = getRadio('nsmanSelf') !== 'none';
        if (selfActive) {
            var wifeNo = document.querySelector('input[name="nsmanWife"][value="no"]');
            if (wifeNo) { wifeNo.checked = true; syncRadioHighlights('nsmanWife'); }
        }
        setGroupDisabled('nsmanWifeGroup', selfActive);
        calcReliefs();
    }
    function onNsmanWifeChange() {
        var wifeActive = getRadio('nsmanWife') === 'yes';
        if (wifeActive) {
            var selfNone = document.querySelector('input[name="nsmanSelf"][value="none"]');
            if (selfNone) { selfNone.checked = true; syncRadioHighlights('nsmanSelf'); }
        }
        setGroupDisabled('nsmanSelfGroup', wifeActive);
        calcReliefs();
    }

    // ── Relief calculation ────────────────────────────────────────────────────
    function calcReliefs() {
        // Donations
        var donations = val('approvedDonations');
        var donationDeduct = donations * 2.5;
        setText('donationDeduction', fmt(donationDeduct));
        setText('rs-donations-amt',  fmtShort(donationDeduct));

        // PTR (rebate, not relief)
        var ptrAmt = val('ptrAmount');
        setText('ptrDisplay', fmt(ptrAmt));
        setText('rs-ptr-amt', fmtShort(ptrAmt));

        // Simple mode
        if (reliefMode === 'simple') {
            var simpleRaw = val('simpleTotalRelief');
            var simpleTotal = Math.min(simpleRaw, 80000);
            setText('simpleReliefDisplay', fmt(simpleTotal));
            reliefState = {
                eir: 0, spouse: 0, qcr: 0, wmcr: 0, parent: 0, gcr: 0,
                sibling: 0, cpf: 0, lifeIns: 0, topup: 0, srs: 0, nsman: 0,
                total: simpleTotal, capped: simpleTotal,
                donations: donationDeduct, ptr: ptrAmt, simpleMode: true, simpleRaw: simpleRaw
            };
            updateTabIndicators();
            return;
        }

        // ── Detailed mode ─────────────────────────────────────────────────────
        // EIR is capped against gross earned income (before employment expense deduction).
        // grossEmploy = annualOW + annualAW (pre-deduction); trade is already net.
        var earnedIncome = incomeState.grossEmploy + incomeState.trade;

        // EIR
        var eirAge = getRadio('eirAge');
        var eirMax = { under55: 1000, '55to59': 6000, '60plus': 8000,
                       dis_under55: 4000, dis_55to59: 10000, dis_60plus: 12000 };
        var eirAmt = Math.min(earnedIncome, eirMax[eirAge] !== undefined ? eirMax[eirAge] : 0);
        setText('rs-eir-amt', fmtShort(eirAmt));

        // Spouse
        var spouseVal = getRadio('spouseRelief');
        var spouseAmt = spouseVal === 'normal' ? 2000 : spouseVal === 'disability' ? 5500 : 0;
        setText('rs-spouse-amt', fmtShort(spouseAmt));

        // Children
        var qcr = val('qcrTotalAmt'); setText('rs-qcr-amt', fmtShort(qcr));
        var wmcr = val('wmcrTotalAmt'); setText('rs-wmcr-amt', fmtShort(wmcr));
        var parentAmt = val('parentTotalAmt'); setText('rs-parent-amt', fmtShort(parentAmt));
        var gcrAmt = getRadio('gcrClaim') === 'yes' ? 3000 : 0;
        setText('rs-gcr-amt', fmtShort(gcrAmt));
        var siblingAmt = val('siblingAmt'); setText('rs-sibling-amt', fmtShort(siblingAmt));

        // CPF Relief ──────────────────────────────────────────────────────────
        var cpfReliefAmt = 0;
        var compulsoryCPF = 0; // used for life insurance $5,000 threshold

        if (cpfMode === 'calc') {
            // OW and AW are stored in incomeState regardless of input mode
            // Annual mode: annualOW = base salary, annualAW = bonus field
            // Monthly mode: annualOW = monthly × 12, annualAW = monthly × bonusMonths
            var owMonthly = incomeState.annualOW / 12; // implied monthly OW for ceiling calc
            var cpfResult = estimateCpfRelief(owMonthly, incomeState.annualAW, getRadio('cpfAge'));
            setText('cpfOnOW', fmt(cpfResult.onOW));
            setText('cpfOnAW', fmt(cpfResult.onAW));
            cpfReliefAmt = cpfResult.total;
            compulsoryCPF = cpfResult.total;
            setText('cpfCalcResult', fmt(cpfReliefAmt));
        } else {
            cpfReliefAmt = val('cpfCustomAmt');
            compulsoryCPF = cpfReliefAmt;
        }
        setText('rs-cpf-amt', fmtShort(cpfReliefAmt));

        // Life Insurance ──────────────────────────────────────────────────────
        var lifeInsRelief = 0;
        var lifeInsPremiums = val('lifeInsPremiums');
        var lifeInsInsuredValue = val('lifeInsInsuredValue');
        var lifeInsNoteEl = $('lifeInsNote');
        var lifeInsNoteText = $('lifeInsNoteText');

        if (compulsoryCPF >= 5000) {
            lifeInsRelief = 0;
            if (lifeInsPremiums > 0) {
                toggleClass(lifeInsNoteEl, 'hidden', false);
                lifeInsNoteText.textContent = 'Life Insurance Relief cannot be claimed as total compulsory CPF contributions ($' + Math.round(compulsoryCPF).toLocaleString('en-SG') + ') meet or exceed $5,000.';
            } else {
                toggleClass(lifeInsNoteEl, 'hidden', true);
            }
        } else {
            var cap1 = 5000 - compulsoryCPF;
            var cap2 = lifeInsInsuredValue > 0 ? lifeInsInsuredValue * 0.07 : Infinity;
            lifeInsRelief = Math.min(lifeInsPremiums, cap1, cap2);
            if (lifeInsPremiums > 0) {
                var binding = '';
                if (cap1 <= cap2 && cap1 < lifeInsPremiums) binding = 'Limited to $5,000 − CPF ($' + Math.round(compulsoryCPF).toLocaleString('en-SG') + ') = $' + Math.round(cap1).toLocaleString('en-SG') + '.';
                else if (cap2 < cap1 && cap2 < lifeInsPremiums && lifeInsInsuredValue > 0) binding = 'Limited to 7% of insured value ($' + Math.round(lifeInsInsuredValue).toLocaleString('en-SG') + ') = $' + Math.round(cap2).toLocaleString('en-SG') + '.';
                if (binding) {
                    toggleClass(lifeInsNoteEl, 'hidden', false);
                    lifeInsNoteText.textContent = binding;
                } else {
                    toggleClass(lifeInsNoteEl, 'hidden', true);
                }
            } else {
                toggleClass(lifeInsNoteEl, 'hidden', true);
            }
        }
        setText('lifeInsCalcResult', fmt(lifeInsRelief));
        setText('rs-lifeins-amt', fmtShort(lifeInsRelief));

        // Top-up & SRS ────────────────────────────────────────────────────────
        var topupAmt = Math.min(val('topupSelf'), 8000) + Math.min(val('topupFamily'), 8000);
        setText('rs-topup-amt', fmtShort(topupAmt));
        var srsCap = getRadio('srsCitizen') === 'foreign' ? 35700 : 15300;
        var srsAmt = Math.min(val('srsContribution'), srsCap);
        setText('rs-srs-amt', fmtShort(srsAmt));

        // NSman ────────────────────────────────────────────────────────────────
        var nsmanSelfAmts = { none: 0, noactivity: 1500, activity_nonkah: 3000, kah_noactivity: 3500, kah_activity: 5000 };
        var nsmanSelfAmt   = nsmanSelfAmts[getRadio('nsmanSelf')] || 0;
        var nsmanWifeAmt   = getRadio('nsmanWife')   === 'yes' ? 750 : 0;
        var nsmanParentAmt = getRadio('nsmanParent') === 'yes' ? 750 : 0;
        var nsmanCapWarn = $('nsmanCapWarning'), nsmanCapWarnText = $('nsmanCapWarningText');
        var nsmanWPWarn = $('nsmanWifeParentWarning'), nsmanWPWarnText = $('nsmanWifeParentWarningText');
        var warningMsg = '', wifeParentMsg = '', nsmanAmt = 0;

        if (nsmanSelfAmt > 0) {
            if (nsmanParentAmt > 0) {
                nsmanAmt = Math.max(nsmanSelfAmt, nsmanParentAmt);
                warningMsg = nsmanSelfAmt >= nsmanParentAmt
                    ? 'You and your child are both NSmen. Only the higher applies — NSman Self Relief ($' + nsmanSelfAmt.toLocaleString('en-SG') + ') is used.'
                    : 'You and your child are both NSmen. Only the higher applies — NSman Parent Relief ($750) is used.';
            } else { nsmanAmt = nsmanSelfAmt; }
        } else if (nsmanWifeAmt > 0 && nsmanParentAmt > 0) {
            nsmanAmt = 750;
            wifeParentMsg = 'NSman Wife Relief and NSman Parent Relief are capped at $750 combined — only one may be claimed.';
        } else { nsmanAmt = nsmanWifeAmt + nsmanParentAmt; }
        setText('rs-nsman-amt', fmtShort(nsmanAmt));
        toggleClass(nsmanCapWarn, 'hidden', !warningMsg);
        if (warningMsg) nsmanCapWarnText.innerHTML = warningMsg;
        toggleClass(nsmanWPWarn, 'hidden', !wifeParentMsg);
        if (wifeParentMsg) nsmanWPWarnText.innerHTML = wifeParentMsg;

        // Total reliefs ───────────────────────────────────────────────────────
        var total = eirAmt + spouseAmt + qcr + wmcr + parentAmt + gcrAmt + siblingAmt
                  + cpfReliefAmt + lifeInsRelief + topupAmt + srsAmt + nsmanAmt;
        var capped = Math.min(total, 80000);

        setText('reliefTotalDisplay', fmtShort(total));
        setText('reliefCapRemaining', total > 80000
            ? '−' + fmtShort(total - 80000) + ' over'
            : fmtShort(80000 - total));

        var pct = Math.min(100, total / 80000 * 100);
        var capBarFill = $('capBarFill'), capPctEl = $('capPct');
        if (capBarFill) {
            capBarFill.style.width = pct + '%';
            capBarFill.className = 'cap-bar-fill' + (total > 80000 ? ' over' : '');
        }
        if (capPctEl) {
            capPctEl.textContent = Math.round(pct) + '%';
            capPctEl.className = 'cap-pct' + (total > 80000 ? ' over' : '');
        }

        reliefState = {
            eir: eirAmt, spouse: spouseAmt, qcr: qcr, wmcr: wmcr, parent: parentAmt,
            gcr: gcrAmt, sibling: siblingAmt, cpf: cpfReliefAmt, lifeIns: lifeInsRelief,
            topup: topupAmt, srs: srsAmt, nsman: nsmanAmt,
            total: total, capped: capped, donations: donationDeduct, ptr: ptrAmt,
            simpleMode: false
        };
        updateTabIndicators();
    }

    // ── Results page ──────────────────────────────────────────────────────────
    function buildTaxBreakdown(chargeable) {
        if (chargeable <= 0) {
            return '<div style="color:var(--text-muted);font-size:0.88rem;text-align:center;padding:12px 0;">No chargeable income.</div>';
        }
        var rows = '';
        var remaining = chargeable;
        var totalTax = 0;
        for (var i = 0; i < brackets.length; i++) {
            var b = brackets[i];
            if (remaining <= 0) break;
            var slice = Math.min(remaining, b.to === Infinity ? remaining : b.to - b.from);
            var tax   = slice * b.rate;
            totalTax += tax;
            var rateStr = (b.rate * 100) % 1 === 0
                ? (b.rate * 100).toFixed(0) + '%'
                : (b.rate * 100).toFixed(1) + '%';
            var sliceFmt = '$' + Math.round(slice).toLocaleString('en-SG');
            var isFirst  = rows === '';
            rows += '<div class="tax-breakdown-row' + (isFirst ? ' first' : '') + '">'
                  + '<span class="tbr-slice">' + sliceFmt + ' &times; ' + rateStr + '</span>'
                  + '<span class="tbr-tax">' + fmt(tax) + '</span>'
                  + '</div>';
            remaining -= slice;
        }
        rows += '<div class="tbr-total-row">'
              + '<span class="tbr-total-label">Tax on Chargeable Income</span>'
              + '<span class="tbr-total-amt">' + fmt(totalTax) + '</span>'
              + '</div>';
        return rows;
    }

    function updateResults() {
        var s = incomeState;
        var r = reliefState;
        var totalIncome  = s.employ + s.rental + s.trade + s.other;
        var donDeduct    = r.donations;
        var assessable   = Math.max(0, totalIncome - donDeduct);
        var reliefs      = r.capped;
        var chargeable   = Math.max(0, assessable - reliefs);
        var taxOnChargeable = calculateTax(chargeable);
        var ptr          = Math.min(r.ptr, taxOnChargeable);  // PTR cannot exceed tax payable
        var netTax       = Math.max(0, taxOnChargeable - ptr);

        // Show/hide income rows
        var rEmployRow = $('r-employRow'), rRentalRow = $('r-rentalRow');
        var rTradeRow = $('r-tradeRow'), rOtherRow = $('r-otherRow');
        var rDonationsRow = $('r-donationsRow'), rReliefsRow = $('r-reliefsRow');
        var rPTRRow = $('r-ptrRow');
        var rPTRCarryforward = $('r-ptrCarryforward');
        var rPTRCarryforwardText = $('r-ptrCarryforwardText');

        function showHide(el, show) { if (el) el.style.display = show ? '' : 'none'; }
        showHide(rEmployRow,    s.employ  > 0);
        showHide(rRentalRow,    s.rental  > 0);
        showHide(rTradeRow,     s.trade   > 0);
        showHide(rOtherRow,     s.other   > 0);
        showHide(rDonationsRow, donDeduct > 0);
        showHide(rReliefsRow,   reliefs   > 0);
        showHide(rPTRRow,       ptr       > 0);

        // Hide "Total Income" row when only one source contributes (it's redundant)
        var activeSources = [s.employ, s.rental, s.trade, s.other].filter(function(v) { return v > 0; }).length;
        showHide($('r-totalIncomeRow'), activeSources > 1);

        // PTR carryforward info
        var ptrUnused = r.ptr - ptr;
        if (rPTRCarryforward) {
            if (r.ptr > 0 && ptrUnused > 0.005) {
                rPTRCarryforward.classList.remove('hidden');
                rPTRCarryforwardText.textContent = 'Your PTR (' + fmt(r.ptr) + ') exceeds your tax payable. Only ' + fmt(ptr) + ' is applied this YA. The remaining ' + fmt(ptrUnused) + ' is carried forward to offset your tax in future YAs.';
            } else {
                rPTRCarryforward.classList.add('hidden');
            }
        }

        setText('r-employ',        fmt(s.employ));
        setText('r-rental',        fmt(s.rental));
        setText('r-trade',         fmt(s.trade));
        setText('r-other',         fmt(s.other));
        setText('r-totalIncome',   fmt(totalIncome));
        setText('r-donations',     '\u2212' + fmt(donDeduct));
        setText('r-assessable',    fmt(assessable));
        setText('r-reliefs',       '\u2212' + fmt(reliefs));
        setText('r-chargeable',    fmt(chargeable));
        setText('r-taxOnChargeable', fmt(taxOnChargeable));
        setText('r-ptr',           '\u2212' + fmt(ptr));
        setText('r-taxPayable',    fmt(netTax));
        setText('r-totalReliefs',  fmt(reliefs));

        // ── GIRO $20 minimum logic ────────────────────────────────────────────
        var giro       = calcGiroMonths(netTax);
        var giroEl     = $('r-taxMonthly');
        var giroSpanEl = $('r-taxMonthlySpan');
        if (netTax <= 0) {
            if (giroEl)     giroEl.textContent     = '$0.00';
            if (giroSpanEl) giroSpanEl.textContent = '';
        } else if (giro.months <= 1) {
            if (giroEl)     giroEl.textContent     = fmt(netTax) + ' (lump sum)';
            if (giroSpanEl) giroSpanEl.textContent = '1 month';
        } else {
            if (giroEl)     giroEl.textContent     = fmt(giro.monthly) + ' / month';
            if (giroSpanEl) giroSpanEl.textContent = giro.months + ' months';
        }

        // ── Progressive tax breakdown ─────────────────────────────────────────
        var breakdownEl = $('taxBreakdownRows');
        if (breakdownEl) breakdownEl.innerHTML = buildTaxBreakdown(chargeable);

        // Relief breakdown
        var reliefBreakdown = $('reliefBreakdownRows');
        if (r.simpleMode) {
            if (r.capped > 0) {
                var html = '<div class="result-row" style="border-top:none"><span class="result-label">Total Reliefs (entered directly)</span><span class="result-value">' + fmt(r.capped) + '</span></div>';
                if (r.simpleRaw > 80000) html += '<div class="warning-box" style="margin-top:10px;"><span class="icon">&#9888;&#65039;</span><span>Your entered reliefs ($' + Math.round(r.simpleRaw).toLocaleString('en-SG') + ') exceed the $80,000 cap. Capped at $80,000.</span></div>';
                reliefBreakdown.innerHTML = html;
            } else {
                reliefBreakdown.innerHTML = '<div style="color:var(--text-muted);font-size:0.88rem;text-align:center;padding:12px 0;">No reliefs entered.</div>';
            }
            return;
        }

        var breakdown = [
            { label: 'Earned Income Relief',                   amt: r.eir      },
            { label: 'Spouse Relief',                          amt: r.spouse   },
            { label: 'Qualifying / Handicapped Child Relief',  amt: r.qcr      },
            { label: "Working Mother's Child Relief",          amt: r.wmcr     },
            { label: 'Parent Relief',                          amt: r.parent   },
            { label: 'Grandparent Caregiver Relief',           amt: r.gcr      },
            { label: 'Sibling Relief (Disability)',            amt: r.sibling  },
            { label: 'CPF / Provident Fund Relief',            amt: r.cpf      },
            { label: 'Life Insurance Relief',                  amt: r.lifeIns  },
            { label: 'CPF Cash Top-up Relief',                 amt: r.topup    },
            { label: 'SRS Relief',                             amt: r.srs      },
            { label: 'NSman Relief',                           amt: r.nsman    }
        ].filter(function(x) { return x.amt > 0; });

        var rows = breakdown.length === 0
            ? '<div style="color:var(--text-muted);font-size:0.88rem;text-align:center;padding:12px 0;">No reliefs claimed yet.</div>'
            : breakdown.map(function(b, i) {
                return '<div class="result-row" style="' + (i === 0 ? 'border-top:none' : '') + '">'
                    + '<span class="result-label">' + b.label + '</span>'
                    + '<span class="result-value">' + fmt(b.amt) + '</span></div>';
              }).join('');

        if (r.total > 80000) {
            rows += '<div class="warning-box" style="margin-top:10px;"><span class="icon">&#9888;&#65039;</span><span>Your claimed reliefs ($'
                  + Math.round(r.total).toLocaleString('en-SG')
                  + ') exceed the $80,000 cap. Capped at $80,000.</span></div>';
        }
        reliefBreakdown.innerHTML = rows;
    }

    // ── Event listeners ───────────────────────────────────────────────────────
    // Income page
    document.querySelectorAll('#page-income input[type="number"]').forEach(function(el) {
        el.addEventListener('input',  calcIncome);
        el.addEventListener('change', calcIncome);
    });
    // Relief page
    document.querySelectorAll('#page-reliefs input[type="number"]').forEach(function(el) {
        el.addEventListener('input',  calcReliefs);
        el.addEventListener('change', calcReliefs);
    });

    // NSman mutual-exclusion
    document.querySelectorAll('input[name="nsmanSelf"]').forEach(function(r) { r.addEventListener('change', onNsmanSelfChange); });
    document.querySelectorAll('input[name="nsmanWife"]').forEach(function(r) { r.addEventListener('change', onNsmanWifeChange); });

    // Other relief radios
    ['eirAge', 'spouseRelief', 'gcrClaim', 'srsCitizen', 'nsmanParent', 'cpfAge'].forEach(function(name) {
        document.querySelectorAll('input[name="' + name + '"]').forEach(function(r) { r.addEventListener('change', calcReliefs); });
    });

    // Radio highlight sync
    document.querySelectorAll('.radio-option input[type="radio"]').forEach(function(radio) {
        radio.addEventListener('change', function() {
            document.querySelectorAll('input[name="' + this.name + '"]').forEach(function(r) {
                r.closest('.radio-option').classList.toggle('selected', r.checked);
            });
        });
    });
    document.querySelectorAll('.radio-option input[type="radio"]:checked').forEach(function(r) {
        r.closest('.radio-option').classList.add('selected');
    });

    // Block minus key, prevent scroll wheel
    document.querySelectorAll('input[type="number"]').forEach(function(el) {
        el.addEventListener('keydown', function(e) {
            if (e.key === '-' || e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
        });
        el.addEventListener('input', function() {
            if (this.value !== '' && parseFloat(this.value) < 0) this.value = 0;
        });
        el.addEventListener('focus', function() {
            if (this.value === '0' || this.value === '0.00') this.value = '';
        });
        el.addEventListener('wheel', function() {
            if (document.activeElement === this) this.blur();
        }, { passive: true });
    });

    // Initial calculation
    calcIncome();
});
