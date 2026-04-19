use rust_math::complex::{BigComplex, Complex64};
use bigdecimal::{BigDecimal, Zero, One, FromPrimitive};

#[test]
fn test_complex64() {
    let c = Complex64 { r: 1.0, i: 2.0 };
    assert_eq!(c.r, 1.0);
    assert_eq!(c.i, 2.0);
}

#[test]
fn test_bigcomplex_basic() {
    let zero = BigComplex::zero();
    assert_eq!(zero.r, BigDecimal::zero());
    assert_eq!(zero.i, BigDecimal::zero());

    let one = BigComplex::one();
    assert_eq!(one.r, BigDecimal::one());
    assert_eq!(one.i, BigDecimal::zero());

    let two = BigComplex::two();
    assert_eq!(two.r, BigDecimal::from(2));
    assert_eq!(two.i, BigDecimal::zero());

    let custom = BigComplex::from_f64(1.5, -2.5);
    assert_eq!(custom.r, BigDecimal::from_f64(1.5).unwrap());
    assert_eq!(custom.i, BigDecimal::from_f64(-2.5).unwrap());
}

#[test]
fn test_bigcomplex_math() {
    let a = BigComplex::from_f64(2.0, 3.0);
    let b = BigComplex::from_f64(4.0, -1.0);

    // Addition
    let sum = &a + &b;
    assert_eq!(sum.r, BigDecimal::from_f64(6.0).unwrap());
    assert_eq!(sum.i, BigDecimal::from_f64(2.0).unwrap());

    // Subtraction
    let diff = &a - &b;
    assert_eq!(diff.r, BigDecimal::from_f64(-2.0).unwrap());
    assert_eq!(diff.i, BigDecimal::from_f64(4.0).unwrap());

    // Multiplication: (2+3i)*(4-i) = 8 - 2i + 12i - 3i^2 = 11 + 10i
    let prod = &a * &b;
    assert_eq!(prod.r, BigDecimal::from_f64(11.0).unwrap());
    assert_eq!(prod.i, BigDecimal::from_f64(10.0).unwrap());

    // Division: (2+3i)/(4-i) = (2+3i)*(4+i)/17 = (8+2i+12i-3)/17 = 5/17 + 14/17i
    let quot = &a / &b;
    let expected_r = BigDecimal::from_f64(5.0/17.0).unwrap().with_prec(100);
    let expected_i = BigDecimal::from_f64(14.0/17.0).unwrap().with_prec(100);
    
    // We check precision closely
    let diff_r = (&quot.r - &expected_r).abs();
    let diff_i = (&quot.i - &expected_i).abs();
    assert!(diff_r < BigDecimal::from_f64(1e-15).unwrap(), "Div Real failed");
    assert!(diff_i < BigDecimal::from_f64(1e-15).unwrap(), "Div Imag failed");
    
    // Norm squared: |2+3i|^2 = 4 + 9 = 13
    let norm_sq = a.norm_sq();
    assert_eq!(norm_sq, BigDecimal::from_f64(13.0).unwrap().with_prec(100));
}
