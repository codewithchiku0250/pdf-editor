import React, { useState, useEffect } from 'react';
import { X, Sparkles, CreditCard, QrCode, ShieldCheck, Check, Loader2, Key, Info } from 'lucide-react';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (planName: string, days: number, price: number) => void;
  user: { name: string; email: string; avatar: string } | null;
}

interface Plan {
  id: string;
  name: string;
  days: number;
  price: number;
  pricePerDay: string;
  popular: boolean;
  badge?: string;
  description: string;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ isOpen, onClose, onSuccess, user }) => {
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [paymentMode, setPaymentMode] = useState<'real' | 'simulated'>('simulated');
  const [razorpayKey, setRazorpayKey] = useState(() => localStorage.getItem('propdf_rzp_key') || '');
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card'>('upi');
  const [checkoutStep, setCheckoutStep] = useState<'pricing' | 'payment' | 'processing' | 'success'>('pricing');
  
  // Card Inputs State (For simulated mode)
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardName, setCardName] = useState('');

  // Processing steps text
  const [processingText, setProcessingText] = useState('Initiating payment gateway...');

  // Save key to local storage
  useEffect(() => {
    localStorage.setItem('propdf_rzp_key', razorpayKey);
  }, [razorpayKey]);

  if (!isOpen) return null;

  const plans: Plan[] = [
    {
      id: 'starter',
      name: 'Starter Plan',
      days: 3,
      price: 99,
      pricePerDay: '₹33/day',
      popular: false,
      description: 'Ideal for quick edits and one-time document modifications.',
    },
    {
      id: 'pro',
      name: 'Pro Project Plan',
      days: 5,
      price: 119,
      pricePerDay: '₹23.8/day',
      popular: true,
      badge: 'Best Selling',
      description: 'Perfect for ongoing projects and weekly business operations.',
    },
    {
      id: 'ultimate',
      name: 'Ultimate Access',
      days: 30,
      price: 299,
      pricePerDay: '₹9.9/day',
      popular: false,
      badge: 'Best Value',
      description: 'Unrestricted monthly access for power users and teams.',
    },
  ];

  // Dynamically load Razorpay SDK
  const loadRazorpaySDK = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = value.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length > 0) {
      setCardNumber(parts.join(' '));
    } else {
      setCardNumber(value);
    }
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/[^0-9]/g, '');
    if (value.length > 2) {
      value = `${value.slice(0, 2)}/${value.slice(2, 4)}`;
    }
    setCardExpiry(value.slice(0, 5));
  };

  const handlePay = async () => {
    if (!selectedPlan) return;

    if (paymentMode === 'real') {
      if (!razorpayKey.trim()) {
        alert('Please enter a valid Razorpay API Key ID (rzp_test_...) or switch to Simulated Mode.');
        return;
      }

      setCheckoutStep('processing');
      setProcessingText('Loading Razorpay Payment Gateway...');

      const sdkLoaded = await loadRazorpaySDK();
      if (!sdkLoaded) {
        setCheckoutStep('payment');
        alert('Failed to load Razorpay SDK. Please check your internet connection.');
        return;
      }

      setCheckoutStep('payment'); // Return to payment tab to wait for popup

      const options = {
        key: razorpayKey.trim(),
        amount: selectedPlan.price * 100, // In paise
        currency: 'INR',
        name: 'ProPDF Editor',
        description: `${selectedPlan.name} (${selectedPlan.days} Days)`,
        image: 'https://ui-avatars.com/api/?name=Pro+PDF&background=6366f1&color=fff&bold=true',
        handler: function (_response: any) {
          // Success Callback
          setCheckoutStep('processing');
          setProcessingText('Verifying Razorpay payment signature...');
          
          setTimeout(() => {
            setCheckoutStep('success');
            setTimeout(() => {
              onSuccess(selectedPlan.name, selectedPlan.days, selectedPlan.price);
              setSelectedPlan(null);
              setCheckoutStep('pricing');
            }, 1500);
          }, 1000);
        },
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
        },
        theme: {
          color: '#6366f1',
        },
        modal: {
          ondismiss: function () {
            console.log('Payment modal dismissed');
          }
        }
      };

      try {
        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      } catch (err) {
        console.error(err);
        alert('Could not initialize Razorpay. Check if your API Key ID is correct.');
      }
    } else {
      // SIMULATED PAYMENT MODE
      setCheckoutStep('processing');
      setProcessingText('Connecting to simulated gateway...');

      setTimeout(() => {
        setProcessingText('Authorizing transaction amount...');
        setTimeout(() => {
          setProcessingText('Finalizing payment with merchant bank...');
          setTimeout(() => {
            setCheckoutStep('success');
            setTimeout(() => {
              onSuccess(selectedPlan.name, selectedPlan.days, selectedPlan.price);
              setSelectedPlan(null);
              setCheckoutStep('pricing');
              setCardNumber('');
              setCardExpiry('');
              setCardCvv('');
              setCardName('');
            }, 1500);
          }, 800);
        }, 800);
      }, 800);
    }
  };

  const isCardFormValid = () => {
    return (
      cardNumber.replace(/\s/g, '').length === 16 &&
      cardExpiry.length === 5 &&
      cardCvv.length === 3 &&
      cardName.trim().length > 2
    );
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content glass subscription-modal-container">
        
        {/* Modal Header */}
        <div className="modal-header">
          <div className="premium-header-title">
            <Sparkles className="premium-sparkle-icon" size={20} />
            <h2>Unlock Premium Export</h2>
          </div>
          {checkoutStep !== 'processing' && checkoutStep !== 'success' && (
            <button className="close-btn" onClick={onClose}>
              <X size={20} />
            </button>
          )}
        </div>

        <div className="modal-body">
          {/* STEP 1: PRICING GRID */}
          {checkoutStep === 'pricing' && (
            <div className="pricing-selector-section">
              <p className="pricing-intro">
                Choose a plan to export and download your edited PDF. All premium plans include complete editor functions, unlimited downloads, and digital signature stamps.
              </p>

              <div className="pricing-grid">
                {plans.map((plan) => (
                  <div
                    key={plan.id}
                    className={`pricing-card ${plan.popular ? 'popular' : ''}`}
                    onClick={() => setSelectedPlan(plan)}
                  >
                    {plan.badge && <span className="pricing-badge">{plan.badge}</span>}
                    <div className="plan-name">{plan.name}</div>
                    <div className="plan-price-container">
                      <span className="currency">₹</span>
                      <span className="price">{plan.price}</span>
                    </div>
                    <div className="plan-duration">{plan.days} Days Access</div>
                    <div className="plan-meta">{plan.pricePerDay}</div>
                    <p className="plan-desc">{plan.description}</p>
                    
                    <button 
                      className={`btn-select-plan ${plan.popular ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPlan(plan);
                        setCheckoutStep('payment');
                      }}
                    >
                      Choose Plan
                    </button>
                  </div>
                ))}
              </div>

              <div className="premium-features-list">
                <h3>What's included in all plans:</h3>
                <div className="features-grid-mini">
                  <div className="feature-bullet"><Check size={14} /> Unlimited high-res exports</div>
                  <div className="feature-bullet"><Check size={14} /> Redact & whiteout content</div>
                  <div className="feature-bullet"><Check size={14} /> Draw cursive digital signatures</div>
                  <div className="feature-bullet"><Check size={14} /> Reorder & rotate pages</div>
                  <div className="feature-bullet"><Check size={14} /> Shape & drawing tools</div>
                  <div className="feature-bullet"><Check size={14} /> 100% Secure offline compilation</div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: PAYMENT METHOD & GATEWAY */}
          {checkoutStep === 'payment' && selectedPlan && (
            <div className="payment-gateway-section">
              <button 
                className="back-to-pricing-btn" 
                onClick={() => {
                  setSelectedPlan(null);
                  setCheckoutStep('pricing');
                }}
              >
                ← Back to Plans
              </button>

              <div className="checkout-summary-bar">
                <div>
                  <span>Selected Plan:</span>
                  <strong> {selectedPlan.name} ({selectedPlan.days} Days)</strong>
                </div>
                <div className="checkout-price">
                  Amount Due: <strong>₹{selectedPlan.price}</strong>
                </div>
              </div>

              {/* Gateway Mode Selector */}
              <div className="gateway-mode-selector">
                <button
                  className={`mode-tab-btn ${paymentMode === 'simulated' ? 'active' : ''}`}
                  onClick={() => setPaymentMode('simulated')}
                >
                  <Sparkles size={14} /> Simulated Razorpay Checkout
                </button>
                <button
                  className={`mode-tab-btn ${paymentMode === 'real' ? 'active' : ''}`}
                  onClick={() => setPaymentMode('real')}
                >
                  <Key size={14} /> Real Razorpay Gateway
                </button>
              </div>

              {paymentMode === 'real' ? (
                /* REAL RAZORPAY SETTINGS AND PAY BUTTON */
                <div className="real-razorpay-panel">
                  <div className="rzp-key-input-group">
                    <label>
                      <Key size={14} /> Razorpay API Key ID (rzp_test_... / rzp_live_...)
                    </label>
                    <input
                      type="text"
                      placeholder="Paste your Razorpay Key ID here..."
                      value={razorpayKey}
                      onChange={(e) => setRazorpayKey(e.target.value)}
                      className="payment-input rzp-key-input"
                    />
                    <div className="rzp-help-text">
                      <Info size={12} />
                      <span>The payment options popup will open using the official Razorpay script.</span>
                    </div>
                  </div>

                  <button className="btn-primary btn-pay-now rzp-pay-btn" onClick={handlePay}>
                    Pay with Razorpay (₹{selectedPlan.price})
                  </button>
                </div>
              ) : (
                /* SIMULATED RAZORPAY PANEL */
                <>
                  {/* Payment Methods tabs */}
                  <div className="payment-tabs">
                    <button
                      className={`payment-tab-btn ${paymentMethod === 'upi' ? 'active' : ''}`}
                      onClick={() => setPaymentMethod('upi')}
                    >
                      <QrCode size={16} /> UPI Scan to Pay
                    </button>
                    <button
                      className={`payment-tab-btn ${paymentMethod === 'card' ? 'active' : ''}`}
                      onClick={() => setPaymentMethod('card')}
                    >
                      <CreditCard size={16} /> Credit / Debit Card
                    </button>
                  </div>

                  {/* UPI PANEL */}
                  {paymentMethod === 'upi' && (
                    <div className="upi-payment-panel">
                      <p className="payment-instruction">Scan this QR Code using any UPI App (GPay, PhonePe, Paytm) to complete payment.</p>
                      
                      <div className="upi-qr-wrapper">
                        {/* Simulated visual QR Code using custom styling */}
                        <div className="mock-qr-code">
                          <div className="qr-corner qr-top-left"></div>
                          <div className="qr-corner qr-top-right"></div>
                          <div className="qr-corner qr-bottom-left"></div>
                          <div className="qr-square qr-sq-1"></div>
                          <div className="qr-square qr-sq-2"></div>
                          <div className="qr-square qr-sq-3"></div>
                          <div className="qr-logo-overlay">UPI</div>
                        </div>
                        <div className="upi-id-badge">UPI ID: pay.propdf@bank</div>
                      </div>

                      <button className="btn-primary btn-pay-now" onClick={handlePay}>
                        Simulate Payment Success (UPI Scan)
                      </button>
                    </div>
                  )}

                  {/* CARD PANEL */}
                  {paymentMethod === 'card' && (
                    <div className="card-payment-panel">
                      <div className="card-form-grid">
                        <div className="card-form-group">
                          <label>Cardholder Name</label>
                          <input
                            type="text"
                            placeholder="John Doe"
                            value={cardName}
                            onChange={(e) => setCardName(e.target.value)}
                            className="payment-input"
                          />
                        </div>
                        <div className="card-form-group">
                          <label>Card Number</label>
                          <input
                            type="text"
                            placeholder="4532 7182 9301 8847"
                            value={cardNumber}
                            onChange={handleCardNumberChange}
                            className="payment-input"
                            maxLength={19}
                          />
                        </div>
                        <div className="card-form-row">
                          <div className="card-form-group">
                            <label>Expiry Date</label>
                            <input
                              type="text"
                              placeholder="MM/YY"
                              value={cardExpiry}
                              onChange={handleExpiryChange}
                              className="payment-input"
                              maxLength={5}
                            />
                          </div>
                          <div className="card-form-group">
                            <label>CVV</label>
                            <input
                              type="password"
                              placeholder="123"
                              value={cardCvv}
                              onChange={(e) => setCardCvv(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
                              className="payment-input"
                              maxLength={3}
                            />
                          </div>
                        </div>
                      </div>

                      <button 
                        className="btn-primary btn-pay-now" 
                        onClick={handlePay}
                        disabled={!isCardFormValid()}
                      >
                        Pay ₹{selectedPlan.price} securely
                      </button>
                    </div>
                  )}
                </>
              )}

              <div className="payment-security-badge">
                <ShieldCheck size={16} style={{ color: 'var(--accent-emerald)' }} />
                <span>256-bit SSL Secure Payment Gateway. Powered by Razorpay SDK.</span>
              </div>
            </div>
          )}

          {/* STEP 3: TRANSACTION PROCESSING */}
          {checkoutStep === 'processing' && (
            <div className="payment-processing-section">
              <Loader2 className="spinner payment-processing-spinner" size={48} />
              <h3>Processing Your Transaction</h3>
              <p>{processingText}</p>
              <div className="processing-progress-bar">
                <div className="progress-bar-fill"></div>
              </div>
            </div>
          )}

          {/* STEP 4: SUCCESS FEEDBACK */}
          {checkoutStep === 'success' && selectedPlan && (
            <div className="payment-success-section animate-scale-up">
              <div className="success-checkmark-wrapper">
                <Check size={40} className="checkmark-icon" />
              </div>
              <h2>Payment Successful!</h2>
              <p>Thank you for subscribing to **{selectedPlan.name}**.</p>
              <p className="success-unlock-text">Your premium export is unlocked. Downloading PDF now...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SubscriptionModal;
