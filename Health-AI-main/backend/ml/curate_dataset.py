import os
import sys
import pandas as pd
import numpy as np

sys.stdout.reconfigure(encoding='utf-8')

RAW_CSV = os.path.join("kolkata_model_output", "kolkata_model_training_dataset.csv")
DICT_CSV = os.path.join("kolkata_model_output", "feature_dictionary.csv")
df_raw = pd.read_csv(RAW_CSV)
df_dict = pd.read_csv(DICT_CSV)

print(f"Original shape: {df_raw.shape}")

# Define curated mappings: curated_name -> { 'raw_col': ..., 'domain': ..., 'unit': ..., 'desc': ..., 'source': ... }
# Where raw_col can be a single column or a list to merge/coalesce across era format changes (e.g. 2008-2016 vs 2017-2021)
mappings = [
    # --- MATERNAL HEALTH ---
    {
        "curated_name": "maternal_anc_registered_total",
        "raw_col": "hmis_total_number_of_pregnant_women_registered_for_anc_public_and_private_facilities_or_rural_and_urban_facilities_value_in_absolute_number",
        "domain": "maternal_health",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Total number of pregnant women registered for ANC"
    },
    {
        "curated_name": "maternal_anc_3plus_checkups",
        "raw_col": "hmis_number_of_pregnant_women_received_3_anc_check_ups_during_pregnancy_public_and_private_facilities_or_rural_and_urban_facilities_value_in_absolute_number",
        "domain": "maternal_health",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Pregnant women received 3+ ANC check-ups during pregnancy"
    },
    {
        "curated_name": "maternal_ifa_100_tablets_given",
        "raw_col": "hmis_total_number_of_pregnant_women_given_100_ifa_tablets_public_and_private_facilities_or_rural_and_urban_facilities_value_in_absolute_number",
        "domain": "maternal_health",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Total pregnant women given 100 IFA tablets"
    },
    {
        "curated_name": "maternal_institutional_deliveries_public",
        "raw_col": "hmis_deliveries_conducted_at_public_institutions_including_c_sections_public_and_private_facilities_or_rural_and_urban_facilities_value_in_absolute_number",
        "domain": "maternal_health",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Deliveries conducted at public institutions"
    },
    {
        "curated_name": "maternal_postpartum_checkup_48h",
        "raw_col": "hmis_women_getting_post_partum_check_up_within_48_hours_after_delivery_public_and_private_facilities_or_rural_and_urban_facilities_value_in_absolute_number",
        "domain": "maternal_health",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Women receiving postpartum check-up within 48 hours after delivery"
    },
    {
        "curated_name": "maternal_c_section_deliveries",
        "raw_col": "hmis_total_c_section_deliveries_performed_public_and_private_facilities_or_rural_and_urban_facilities_value_in_absolute_number",
        "domain": "maternal_health",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Total C-section deliveries performed"
    },
    {
        "curated_name": "maternal_eclampsia_managed",
        "raw_col": "hmis_number_of_eclampsia_cases_managed_during_delivery_public_and_private_facilities_or_rural_and_urban_facilities_value_in_absolute_number",
        "domain": "maternal_health",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Eclampsia cases managed during delivery"
    },
    {
        "curated_name": "maternal_deaths_reported",
        "raw_col": "hmis_number_of_cases_of_maternal_deaths_age_15_49_years_with_the_probable_cause_being_other_causes_excluding_abortion_obstructed_or_prolonged_labour_severe_hypertension_or_fits_pub",
        "domain": "maternal_health",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Maternal deaths (age 15-49) reported"
    },
    # NFHS-5 Maternal
    {
        "curated_name": "nfhs5_maternal_anc_first_trimester_pct",
        "raw_col": "nfhs5_mothers_who_had_an_antenatal_check_up_in_the_first_trimester",
        "domain": "maternal_health",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Mothers who had ANC check-up in first trimester"
    },
    {
        "curated_name": "nfhs5_maternal_anc_4plus_visits_pct",
        "raw_col": "nfhs5_mothers_who_had_at_least_4_antenatal_care_visits",
        "domain": "maternal_health",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Mothers who had at least 4 ANC visits"
    },
    {
        "curated_name": "nfhs5_maternal_ifa_100_days_pct",
        "raw_col": "nfhs5_mothers_who_consumed_iron_folic_acid_for_100_days_or_more_when_they_were_pregnant",
        "domain": "maternal_health",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Mothers consumed IFA for 100+ days during pregnancy"
    },
    {
        "curated_name": "nfhs5_maternal_ifa_180_days_pct",
        "raw_col": "nfhs5_mothers_who_consumed_iron_folic_acid_for_180_days_or_more_when_they_were_pregnant",
        "domain": "maternal_health",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Mothers consumed IFA for 180+ days during pregnancy"
    },
    {
        "curated_name": "nfhs5_maternal_institutional_births_pct",
        "raw_col": "nfhs5_institutional_births",
        "domain": "maternal_health",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Institutional births"
    },
    {
        "curated_name": "nfhs5_maternal_skilled_attendance_pct",
        "raw_col": "nfhs5_births_attended_by_skilled_health_personnel10",
        "domain": "maternal_health",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Births attended by skilled health personnel"
    },
    {
        "curated_name": "nfhs5_maternal_c_section_pct",
        "raw_col": "nfhs5_births_delivered_by_caesarean_section",
        "domain": "maternal_health",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Births delivered by caesarean section"
    },
    {
        "curated_name": "nfhs5_maternal_postnatal_care_2days_pct",
        "raw_col": "nfhs5_mothers_who_received_postnatal_care_from_a_doctor_nurse_lhv_anm_midwife_other_health_personnel_within_2_days_of_delivery",
        "domain": "maternal_health",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Mothers received postnatal care within 2 days of delivery"
    },

    # --- CHILD HEALTH ---
    {
        "curated_name": "child_immunisation_sessions_held",
        "raw_col": "hmis_number_of_immunisation_sessions_held_during_the_month_public_and_private_facilities_or_rural_and_urban_facilities_value_in_absolute_number",
        "domain": "child_health",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Immunisation sessions held"
    },
    {
        "curated_name": "child_fully_immunised_total",
        "raw_col": "hmis_total_number_of_children_9_to_11_months_old_fully_immunised_bcg_dpt123_pentavalent123_opv123_measles_during_the_month_sum_of_items_10_1_13_a_and_10_1_13_b_public_and_private_f",
        "domain": "child_health",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Children 9-11 months fully immunised"
    },
    {
        "curated_name": "child_bcg_vaccinated",
        "raw_col": "hmis_number_of_infants_0_to_11_months_old_received_bcg_immunisation_public_and_private_facilities_or_rural_and_urban_facilities_value_in_absolute_number",
        "domain": "child_health",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Infants received BCG immunisation"
    },
    {
        "curated_name": "child_dpt3_vaccinated",
        "raw_col": "hmis_number_of_infants_0_to_11_months_old_received_dpt3_immunisation_public_and_private_facilities_or_rural_and_urban_facilities_value_in_absolute_number",
        "domain": "child_health",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Infants received DPT3 immunisation"
    },
    {
        "curated_name": "child_opv3_vaccinated",
        "raw_col": "hmis_number_of_infants_0_to_11_months_old_received_opv3_third_dose_public_and_private_facilities_or_rural_and_urban_facilities_value_in_absolute_number",
        "domain": "child_health",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Infants received OPV3 third dose"
    },
    {
        "curated_name": "child_measles_vaccinated",
        "raw_col": "hmis_number_of_infants_0_to_11_months_old_received_measles_immunisation_first_dose_public_and_private_facilities_or_rural_and_urban_facilities_value_in_absolute_number",
        "domain": "child_health",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Infants received Measles immunisation"
    },
    {
        "curated_name": "child_under5_deaths_reported",
        "raw_col": "hmis_number_of_cases_of_infant_or_child_deaths_between_1_month_to_5_years_of_age_with_the_probable_cause_being_other_than_pneumonia_diarrhoea_fever_related_and_measles_public_and_p",
        "domain": "child_health",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Reported deaths in children between 1 month to 5 years"
    },
    # NFHS-5 Child
    {
        "curated_name": "nfhs5_child_fully_vaccinated_pct",
        "raw_col": "nfhs5_children_age_12_23_months_fully_vaccinated_based_on_information_from_either_vaccination_card_or_mother_s_recall11",
        "domain": "child_health",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Children 12-23 months fully vaccinated"
    },
    {
        "curated_name": "nfhs5_child_bcg_pct",
        "raw_col": "nfhs5_children_age_12_23_months_who_have_received_bcg",
        "domain": "child_health",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Children 12-23 months received BCG"
    },
    {
        "curated_name": "nfhs5_child_polio3_pct",
        "raw_col": "nfhs5_children_age_12_23_months_who_have_received_3_doses_of_polio_vaccine13",
        "domain": "child_health",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Children 12-23 months received 3 doses polio"
    },
    {
        "curated_name": "nfhs5_child_penta_dpt3_pct",
        "raw_col": "nfhs5_children_age_12_23_months_who_have_received_3_doses_of_penta_or_dpt_vaccine",
        "domain": "child_health",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Children 12-23 months received 3 doses penta or DPT"
    },
    {
        "curated_name": "nfhs5_child_measles_mcv1_pct",
        "raw_col": "nfhs5_children_age_12_23_months_who_have_received_the_first_dose_of_measles_containing_vaccine_mcv",
        "domain": "child_health",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Children 12-23 months received 1st dose measles vaccine"
    },
    {
        "curated_name": "nfhs5_child_vitamin_a_pct",
        "raw_col": "nfhs5_children_age_9_35_months_who_received_a_vitamin_a_dose_in_the_last_6_months",
        "domain": "child_health",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Children 9-35 months received Vitamin A in last 6 months"
    },

    # --- NUTRITION ---
    {
        "curated_name": "nutrition_newborns_weighed",
        "raw_col": "hmis_number_of_newborns_weighed_at_birth_public_and_private_facilities_or_rural_and_urban_facilities_value_in_absolute_number",
        "domain": "nutrition",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Newborns weighed at birth"
    },
    {
        "curated_name": "nutrition_low_birth_weight_under_2_5kg",
        "raw_col": "hmis_number_of_newborns_having_weight_less_than_2_5_kg_public_and_private_facilities_or_rural_and_urban_facilities_value_in_absolute_number",
        "domain": "nutrition",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Newborns having birth weight less than 2.5 kg"
    },
    {
        "curated_name": "nutrition_breastfed_within_1hr",
        "raw_col": "hmis_number_of_newborns_breast_fed_within_1_hour_of_birth_public_and_private_facilities_or_rural_and_urban_facilities_value_in_absolute_number",
        "domain": "nutrition",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Newborns breast fed within 1 hour of birth"
    },
    # NFHS-5 Nutrition
    {
        "curated_name": "nfhs5_nutrition_stunting_pct",
        "raw_col": "nfhs5_children_under_5_years_who_are_stunted_height_for_age_18",
        "domain": "nutrition",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Children under 5 years stunted (height-for-age)"
    },
    {
        "curated_name": "nfhs5_nutrition_wasting_pct",
        "raw_col": "nfhs5_children_under_5_years_who_are_wasted_weight_for_height_18",
        "domain": "nutrition",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Children under 5 years wasted (weight-for-height)"
    },
    {
        "curated_name": "nfhs5_nutrition_severe_wasting_pct",
        "raw_col": "nfhs5_children_under_5_years_who_are_severely_wasted_weight_for_height_19",
        "domain": "nutrition",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Children under 5 years severely wasted (weight-for-height)"
    },
    {
        "curated_name": "nfhs5_nutrition_underweight_pct",
        "raw_col": "nfhs5_children_under_5_years_who_are_underweight_weight_for_age_18",
        "domain": "nutrition",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Children under 5 years underweight (weight-for-age)"
    },
    {
        "curated_name": "nfhs5_nutrition_child_anemia_pct",
        "raw_col": "nfhs5_children_age_6_59_months_who_are_anaemic_11_0_g_dl_22",
        "domain": "nutrition",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Children 6-59 months anaemic (<11.0 g/dl)"
    },
    {
        "curated_name": "nfhs5_nutrition_women_anemia_pct",
        "raw_col": "nfhs5_all_women_age_15_49_years_who_are_anaemic22",
        "domain": "nutrition",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "All women age 15-49 years anaemic"
    },
    {
        "curated_name": "nfhs5_nutrition_women_overweight_obese_pct",
        "raw_col": "nfhs5_women_who_are_overweight_or_obese_bmi_25_0_kg_m2_21",
        "domain": "nutrition",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Women overweight or obese (BMI >= 25 kg/m2)"
    },
    {
        "curated_name": "nfhs5_nutrition_women_underweight_pct",
        "raw_col": "nfhs5_women_whose_body_mass_index_bmi_is_below_normal_bmi_18_5_kg_m2_21",
        "domain": "nutrition",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Women below normal BMI (<18.5 kg/m2)"
    },

    # --- NCD CONTEXT ---
    {
        "curated_name": "ncd_hypertension_cases_detected",
        "raw_col": "hmis_number_of_new_cases_of_hypertension_bp_140_90_detected_in_pregnant_women_at_the_institution_public_and_private_facilities_or_rural_and_urban_facilities_value_in_absolute_numbe",
        "domain": "ncd",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "New cases of hypertension (BP>140/90) detected at facilities"
    },
    {
        "curated_name": "ncd_outpatient_hypertension_attendance",
        "raw_col": "hmis_outpatient_hypertension_urban_value_in_absolute_number",
        "domain": "ncd",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Urban outpatient attendance for hypertension"
    },
    {
        "curated_name": "ncd_outpatient_diabetes_attendance",
        "raw_col": "hmis_outpatient_diabetes_urban_value_in_absolute_number",
        "domain": "ncd",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Urban outpatient attendance for diabetes"
    },
    {
        "curated_name": "ncd_outpatient_heart_disease_attendance",
        "raw_col": "hmis_outpatient_acute_heart_diseases_urban_value_in_absolute_number",
        "domain": "ncd",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Urban outpatient attendance for acute heart diseases"
    },
    {
        "curated_name": "ncd_outpatient_stroke_attendance",
        "raw_col": "hmis_outpatient_stroke_paralysis_urban_value_in_absolute_number",
        "domain": "ncd",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Urban outpatient attendance for stroke/paralysis"
    },
    {
        "curated_name": "ncd_adult_deaths_heart_hypertension",
        "raw_col": "hmis_number_of_adolscent_adult_deaths_due_to_heart_disease_hypertension_related_urban_value_in_absolute_number",
        "domain": "ncd",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Adult deaths due to heart disease / hypertension related causes"
    },
    {
        "curated_name": "ncd_adult_deaths_cancer",
        "raw_col": "hmis_number_of_adolscent_adult_deaths_due_to_cancer_urban_value_in_absolute_number",
        "domain": "ncd",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Adult deaths due to cancer"
    },
    # NFHS-5 NCD
    {
        "curated_name": "nfhs5_ncd_blood_sugar_high_pct",
        "raw_col": "nfhs5_blood_sugar_level_high_141_160_mg_dl_23",
        "domain": "ncd",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "High blood sugar level (141-160 mg/dl)"
    },
    {
        "curated_name": "nfhs5_ncd_blood_sugar_very_high_pct",
        "raw_col": "nfhs5_blood_sugar_level_very_high_160_mg_dl_23",
        "domain": "ncd",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Very high blood sugar level (>160 mg/dl)"
    },
    {
        "curated_name": "nfhs5_ncd_bp_mildly_elevated_pct",
        "raw_col": "nfhs5_mildly_elevated_blood_pressure_systolic_140_159_mm_of_hg_and_or_diastolic_90_99_mm_of_hg",
        "domain": "ncd",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Mildly elevated BP (Systolic 140-159 / Diastolic 90-99 mm Hg)"
    },
    {
        "curated_name": "nfhs5_ncd_bp_moderately_severely_elevated_pct",
        "raw_col": "nfhs5_moderately_or_severely_elevated_blood_pressure_systolic_160mm_of_hg_and_or_diastolic_100mm_of_hg",
        "domain": "ncd",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Moderately or severely elevated BP (Systolic >=160 / Diastolic >=100 mm Hg)"
    },
    {
        "curated_name": "nfhs5_ncd_tobacco_women_pct",
        "raw_col": "nfhs5_women_age_15_years_and_above_who_use_any_kind_of_tobacco",
        "domain": "ncd",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Women age 15+ who use any kind of tobacco"
    },
    {
        "curated_name": "nfhs5_ncd_tobacco_men_pct",
        "raw_col": "nfhs5_men_age_15_years_and_above_who_use_any_kind_of_tobacco",
        "domain": "ncd",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Men age 15+ who use any kind of tobacco"
    },
    {
        "curated_name": "nfhs5_ncd_alcohol_women_pct",
        "raw_col": "nfhs5_women_age_15_years_and_above_who_consume_alcohol",
        "domain": "ncd",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Women age 15+ who consume alcohol"
    },

    # --- COMMUNICABLE DISEASE ---
    {
        "curated_name": "communicable_child_diarrhoea_cases",
        "raw_col": "hmis_number_of_cases_of_diarrhoea_and_dehydration_reported_in_children_below_5_years_of_age_public_and_private_facilities_or_rural_and_urban_facilities_value_in_absolute_number",
        "domain": "communicable",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Cases of diarrhoea and dehydration reported in children < 5"
    },
    {
        "curated_name": "communicable_child_respiratory_cases",
        "raw_col": "hmis_number_of_children_below_5_years_of_age_admitted_with_respiratory_infections_public_and_private_facilities_or_rural_and_urban_facilities_value_in_absolute_number",
        "domain": "communicable",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Children < 5 admitted with respiratory infections"
    },
    {
        "curated_name": "communicable_child_malaria_cases",
        "raw_col": "hmis_number_of_cases_of_malaria_reported_in_children_below_5_years_of_age_public_and_private_facilities_or_rural_and_urban_facilities_value_in_absolute_number",
        "domain": "communicable",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Cases of malaria reported in children < 5"
    },
    {
        "curated_name": "communicable_adult_tb_deaths",
        "raw_col": "hmis_number_of_adolscent_adult_deaths_due_to_tuberculosis_urban_value_in_absolute_number",
        "domain": "communicable",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Adult deaths due to Tuberculosis"
    },
    {
        "curated_name": "communicable_dengue_deaths",
        "raw_col": "hmis_number_of_deaths_due_to_dengue_urban_value_in_absolute_number",
        "domain": "communicable",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Deaths due to Dengue"
    },
    {
        "curated_name": "communicable_adult_respiratory_deaths",
        "raw_col": "hmis_number_of_adolscent_adult_deaths_due_to_respiratory_diseases_including_infections_other_than_tb_urban_value_in_absolute_number",
        "domain": "communicable",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Adult deaths due to respiratory diseases (other than TB)"
    },
    # NFHS-5 Communicable
    {
        "curated_name": "nfhs5_communicable_diarrhoea_2wk_pct",
        "raw_col": "nfhs5_prevalence_of_diarrhoea_in_the_2_weeks_preceding_the_survey",
        "domain": "communicable",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Prevalence of diarrhoea in last 2 weeks"
    },
    {
        "curated_name": "nfhs5_communicable_ari_2wk_pct",
        "raw_col": "nfhs5_prevalence_of_symptoms_of_acute_respiratory_infection_ari_in_the_2_weeks_preceding_the_survey",
        "domain": "communicable",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Prevalence of symptoms of ARI in last 2 weeks"
    },

    # --- HEALTHCARE ACCESS ---
    {
        "curated_name": "healthcare_access_opd_attendance_total",
        "raw_col": "hmis_allopathic_outpatient_attendance_urban_value_in_absolute_number",
        "domain": "healthcare_access",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Allopathic Outpatient total attendance"
    },
    {
        "curated_name": "healthcare_access_inpatient_midnight_headcount",
        "raw_col": "hmis_in_patient_head_count_at_midnight_urban_value_in_absolute_number",
        "domain": "healthcare_access",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Inpatient head count at midnight"
    },
    {
        "curated_name": "healthcare_access_deliveries_public_facility",
        "raw_col": "hmis_deliveries_conducted_at_public_institutions_including_c_sections_public_and_private_facilities_or_rural_and_urban_facilities_value_in_absolute_number",
        "domain": "healthcare_access",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "Deliveries conducted at Public Institutions"
    },
    {
        "curated_name": "healthcare_access_c_section_private_facility",
        "raw_col": "hmis_no_of_c_section_deliveries_performed_at_private_facilities_public_and_private_facilities_or_rural_and_urban_facilities_value_in_absolute_number",
        "domain": "healthcare_access",
        "unit": "absolute_count",
        "source": "HMIS",
        "transformation": "direct_extraction",
        "desc": "C-section deliveries performed at private facilities"
    },
    # NFHS-5 Healthcare Access
    {
        "curated_name": "nfhs5_healthcare_access_public_births_pct",
        "raw_col": "nfhs5_institutional_births_in_public_facility",
        "domain": "healthcare_access",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Institutional births in public facility"
    },
    {
        "curated_name": "nfhs5_healthcare_access_public_vaccination_pct",
        "raw_col": "nfhs5_children_age_12_23_months_who_received_most_of_their_vaccinations_in_a_public_health_facility",
        "domain": "healthcare_access",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Children received most vaccinations in public facility"
    },
    {
        "curated_name": "nfhs5_healthcare_access_oop_delivery_rs",
        "raw_col": "nfhs5_average_out_of_pocket_expenditure_per_delivery_in_a_public_health_facility_rs",
        "domain": "healthcare_access",
        "unit": "inr",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Average out-of-pocket expenditure per delivery in public facility"
    },
    {
        "curated_name": "nfhs5_healthcare_access_mcp_card_pct",
        "raw_col": "nfhs5_registered_pregnancies_for_which_the_mother_received_a_mother_and_child_protection_mcp_card",
        "domain": "healthcare_access",
        "unit": "percentage",
        "source": "NFHS-5",
        "transformation": "survey_baseline_retained_2019_only",
        "desc": "Registered pregnancies received Mother and Child Protection (MCP) card"
    }
]

print(f"Total curated features defined: {len(mappings)}")

# Verify all raw columns exist in raw df
missing_raw_cols = []
for m in mappings:
    rc = m['raw_col']
    if rc not in df_raw.columns:
        missing_raw_cols.append((m['curated_name'], rc))

if missing_raw_cols:
    print("WARNING: Missing raw columns found:")
    for c, r in missing_raw_cols:
        print(f"  - {c}: {r}")
else:
    print("All curated raw columns successfully matched in the raw dataset!")

# Build curated dataframe
curated_df = pd.DataFrame()
curated_df['year'] = df_raw['year'].astype(int)
curated_df['fiscal_year'] = df_raw['fiscal_year']
curated_df['district'] = "Kolkata"

dict_records = []

for m in mappings:
    c_name = m['curated_name']
    r_col = m['raw_col']
    series = df_raw[r_col]
    curated_df[c_name] = series
    
    non_null_years = curated_df.loc[~curated_df[c_name].isnull(), 'year'].tolist()
    yr_cov = f"{min(non_null_years)}-{max(non_null_years)} ({len(non_null_years)} yrs)" if non_null_years else "None"
    missingness_pct = round((curated_df[c_name].isnull().sum() / len(curated_df)) * 100, 1)

    dict_records.append({
        "feature_name": c_name,
        "original_indicator": r_col,
        "source": m['source'],
        "unit": m['unit'],
        "year_coverage": yr_cov,
        "domain": m['domain'],
        "transformation": m['transformation'],
        "missingness": f"{missingness_pct}%",
        "description": m['desc']
    })

OUTPUT_CSV = os.path.join("backend", "data", "processed", "kolkata_population_health.csv")
curated_df.to_csv(OUTPUT_CSV, index=False)
print(f"\nSaved curated dataset to: {OUTPUT_CSV}")
print(f"Shape: {curated_df.shape[0]} rows, {curated_df.shape[1]} columns")

DICT_OUTPUT_CSV = os.path.join("backend", "data", "processed", "feature_dictionary.csv")
dict_df = pd.DataFrame(dict_records)
dict_df.to_csv(DICT_OUTPUT_CSV, index=False)
print(f"Saved feature dictionary to: {DICT_OUTPUT_CSV}")
print(f"Shape: {dict_df.shape[0]} rows, {dict_df.shape[1]} columns")

# Also copy raw feature dictionary to processed if needed for provenance
RAW_DICT_COPY = os.path.join("backend", "data", "raw", "raw_feature_dictionary.csv")
df_dict.to_csv(RAW_DICT_COPY, index=False)
print(f"Archived raw feature dictionary to: {RAW_DICT_COPY}")
