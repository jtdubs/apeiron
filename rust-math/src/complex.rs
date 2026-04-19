use std::ops::{Add, Sub, Mul, Div};
use bigdecimal::{BigDecimal, Zero, One};

pub struct Complex64 {
    pub r: f64,
    pub i: f64,
}

#[derive(Clone)]
pub struct BigComplex {
    pub r: BigDecimal,
    pub i: BigDecimal,
}

impl BigComplex {
    pub fn new(r: BigDecimal, i: BigDecimal) -> Self {
        Self { r, i }
    }
    
    pub fn zero() -> Self {
        Self::new(BigDecimal::zero(), BigDecimal::zero())
    }
    
    pub fn one() -> Self {
        Self::new(BigDecimal::one(), BigDecimal::zero())
    }

    pub fn two() -> Self {
        Self::new(BigDecimal::from(2), BigDecimal::zero())
    }
    
    pub fn norm_sq(&self) -> BigDecimal {
        (&self.r * &self.r + &self.i * &self.i).with_prec(100)
    }

    pub fn from_f64(r: f64, i: f64) -> Self {
        Self::new(
            bigdecimal::FromPrimitive::from_f64(r).unwrap_or_else(BigDecimal::zero),
            bigdecimal::FromPrimitive::from_f64(i).unwrap_or_else(BigDecimal::zero),
        )
    }
}

// Addition
impl Add for &BigComplex {
    type Output = BigComplex;
    fn add(self, rhs: Self) -> BigComplex {
        BigComplex::new(
            (&self.r + &rhs.r).with_prec(100),
            (&self.i + &rhs.i).with_prec(100)
        )
    }
}

// Subtraction
impl Sub for &BigComplex {
    type Output = BigComplex;
    fn sub(self, rhs: Self) -> BigComplex {
        BigComplex::new(
            (&self.r - &rhs.r).with_prec(100),
            (&self.i - &rhs.i).with_prec(100)
        )
    }
}

// Multiplication
impl Mul for &BigComplex {
    type Output = BigComplex;
    fn mul(self, rhs: Self) -> BigComplex {
        let r = (&self.r * &rhs.r - &self.i * &rhs.i).with_prec(100);
        let i = (&self.r * &rhs.i + &self.i * &rhs.r).with_prec(100);
        BigComplex::new(r, i)
    }
}

// Division
impl Div for &BigComplex {
    type Output = BigComplex;
    fn div(self, rhs: Self) -> BigComplex {
        let den = rhs.norm_sq();
        let r = ((&self.r * &rhs.r + &self.i * &rhs.i) / &den).with_prec(100);
        let i = ((&self.i * &rhs.r - &self.r * &rhs.i) / &den).with_prec(100);
        BigComplex::new(r, i)
    }
}
