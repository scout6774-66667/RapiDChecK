import os
import json
import pandas as pd
import numpy as np

DATA_PATH = os.path.join("kolkata_model_output", "kolkata_model_training_dataset.csv")
DICT_PATH = os.path.join("kolkata_model_output", "feature_dictionary.csv")
SUMMARY_PATH = os.path.join("kolkata_model_output", "processing_summary.txt")

df = pd.read_csv(DATA_PATH)
fd = pd.read_csv(DICT_PATH)

print("=" * 60)
print("AUDIT REPORT: KOLKATA HEALTH MODEL DATASET")
print("=" * 60)

print(f"Dataset Shape: {df.shape[0]} rows, {df.shape[1]} columns")
print(f"Feature Dictionary Shape: {fd.shape[0]} rows, {fd.shape[1]} columns")

# Year column and range
year_col = None
district_col = None
for col in df.columns:
    if "year" in col.lower():
        year_col = col
    if "district" in col.lower():
        district_col = col

print(f"Year column: {year_col}")
if year_col:
    years = sorted(df[year_col].dropna().unique().tolist())
    print(f"Year Range: {years[0]} to {years[-1]} ({len(years)} distinct years: {years})")

print(f"District column: {district_col}")
if district_col:
    print(f"Districts: {df[district_col].unique().tolist()}")

# Sources
print("\n--- Feature Sources ---")
source_counts = fd['source'].value_counts().to_dict()
print(f"Source breakdown in dictionary: {source_counts}")

# Check features in dataset vs dictionary
feature_cols = [c for c in df.columns if c not in [year_col, district_col]]
hmis_cols = [c for c in feature_cols if c.startswith("hmis_")]
nfhs_cols = [c for c in feature_cols if c.startswith("nfhs5_") or c.startswith("nfhs_")]
other_cols = [c for c in feature_cols if c not in hmis_cols and c not in nfhs_cols]

print(f"Dataset HMIS feature count: {len(hmis_cols)}")
print(f"Dataset NFHS feature count: {len(nfhs_cols)}")
print(f"Other columns: {len(other_cols)} ({other_cols})")

# Missingness
missing_per_col = df[feature_cols].isnull().sum()
missing_rate_per_col = (missing_per_col / len(df)) * 100
total_cells = df[feature_cols].size
total_missing = missing_per_col.sum()
print(f"\n--- Missingness ---")
print(f"Total cells: {total_cells}")
print(f"Total missing: {total_missing} ({total_missing/total_cells*100:.2f}%)")

# Missingness in HMIS vs NFHS
hmis_missing_rate = (df[hmis_cols].isnull().sum().sum() / (len(df) * len(hmis_cols))) * 100 if hmis_cols else 0
nfhs_missing_rate = (df[nfhs_cols].isnull().sum().sum() / (len(df) * len(nfhs_cols))) * 100 if nfhs_cols else 0
print(f"HMIS missing rate: {hmis_missing_rate:.2f}%")
print(f"NFHS missing rate: {nfhs_missing_rate:.2f}% (Expected ~{100 - (1/14)*100:.1f}% because NFHS-5 is only 1 year 2019-20)")

# NFHS coverage across years
if nfhs_cols:
    nfhs_nonnull_by_year = {}
    for yr in years:
        sub = df[df[year_col] == yr][nfhs_cols]
        nfhs_nonnull_by_year[str(yr)] = int((~sub.isnull()).sum().sum())
    print(f"NFHS non-null count by year: {nfhs_nonnull_by_year}")

# Sparsity distribution
zero_or_null_rates = ((df[feature_cols].isnull() | (df[feature_cols] == 0)).sum() / len(df)) * 100
sparse_90 = (zero_or_null_rates >= 90).sum()
sparse_70 = (zero_or_null_rates >= 70).sum()
sparse_50 = (zero_or_null_rates >= 50).sum()
print(f"\n--- Sparsity ---")
print(f"Features with >= 90% missing or zero: {sparse_90} ({sparse_90/len(feature_cols)*100:.1f}%)")
print(f"Features with >= 70% missing or zero: {sparse_70} ({sparse_70/len(feature_cols)*100:.1f}%)")
print(f"Features with >= 50% missing or zero: {sparse_50} ({sparse_50/len(feature_cols)*100:.1f}%)")

# Units in dictionary
print("\n--- Units in Feature Dictionary ---")
if 'unit' in fd.columns:
    print(fd['unit'].value_counts(dropna=False).to_dict())

# Categories in dictionary
print("\n--- Categories in Feature Dictionary ---")
if 'category' in fd.columns:
    print(fd['category'].value_counts(dropna=False).head(10).to_dict())

# Facility categories in dictionary
print("\n--- Facility Categories in Feature Dictionary ---")
if 'facility_category' in fd.columns:
    print(fd['facility_category'].value_counts(dropna=False).to_dict())

# Indicator heads in dictionary
print("\n--- Indicator Heads (top 15) ---")
if 'indicator_head' in fd.columns:
    print(fd['indicator_head'].value_counts(dropna=False).head(15).to_dict())

# Duplicate feature names or duplicate indicator descriptions
print("\n--- Duplicates ---")
dup_names = fd['feature_name'].duplicated().sum()
dup_indicators = fd['indicator'].dropna().duplicated().sum()
print(f"Duplicate feature names in dictionary: {dup_names}")
print(f"Duplicate indicator descriptions in dictionary: {dup_indicators}")
