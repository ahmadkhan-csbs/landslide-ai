import pandas as pd

# Data load karo
df = pd.read_csv("data/Global_Landslide_Catalog_Export_rows.csv", encoding="latin1")

print("=" * 50)
print("📊 DATASET KA OVERVIEW")
print("=" * 50)
print(f"Total rows (events): {len(df)}")
print(f"Total columns: {len(df.columns)}")

print("\n📋 COLUMN NAMES:")
for col in df.columns:
    print(f"  - {col}")

print("\n🇮🇳 INDIA KE EVENTS KITNE HAIN:")
india = df[df['country_name'].str.contains('India', case=False, na=False)]
print(f"India: {len(india)} events")

print("\n📍 INDIA KE STATES:")
print(india['admin_division_name'].value_counts().head(15))

print("\n🔍 PEHLI 5 ROWS SAMPLE:")
print(df.head())
