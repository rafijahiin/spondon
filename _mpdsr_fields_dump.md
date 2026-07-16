
========== F01 Community Maternal ==========
geopoint                   location               GPS location (required — step outside if no signal)
date                       collection_date        Date
select_one district        district               District
text                       upazila                Upazila
text                       union                  Union / Pourashava
text                       ward                   Ward
text                       village                Village / Mahalla
text                       enumerator_name        Your name (person filling this form)
text                       enumerator_designation Designation
text                       enumerator_institution Institution
text                       enumerator_mobile      Mobile number
date                       office_submission_date Date of form submission
text                       case_serial            Annual maternal death serial number
text                       office_receiver        Name & signature of form receiver
select_one yes_no          consent_given          Consent given by respondent?
date                       interview_date         Date of interview
text                       respondent_mobile      Respondent mobile number
text                       respondent_main_name   Main respondent — name
select_one relationship    respondent_main_rel    Main respondent — relationship with deceased
select_one yes_no          respondent_main_presen Main respondent — present at time of death?
text                       respondent_alt1_name   Associate respondent 1 — name
select_one relationship    respondent_alt1_rel    Associate 1 — relationship
select_one yes_no          respondent_alt1_presen Associate 1 — present at time of death?
text                       respondent_alt2_name   Associate respondent 2 — name
select_one relationship    respondent_alt2_rel    Associate 2 — relationship
select_one yes_no          respondent_alt2_presen Associate 2 — present at time of death?
text                       clinic_name            Community Clinic name
text                       clinic_code            Community Clinic code (must be filled)
text                       deceased_name          Mother's name
text                       mother_dhis2_code      Mother's online registration (DHIS-2) code (must be filled)
integer                    deceased_age           Mother's age (years)
select_one education_level mother_education       Mother's education
select_one ses             household_ses          Household socio-economic status
text                       deceased_husband       Husband's name
integer                    husband_age            Husband's age (years)
date                       death_date             1. Date of death
time                       death_time             1a. Time of death (24-hour)
select_one death_period    death_period           2. When did the death occur?
select_one death_place     death_place            3. Where did the death occur?
text                       death_place_other      Other place (specify)
integer                    gestation_month        4. Month of pregnancy at death
integer                    gestation_week         4a. Week of pregnancy at death
integer                    children_born          5. How many children has the mother delivered?
integer                    abortion_count         6. How many abortions / miscarriages has the mother had?
select_one yes_no          abortion_unknown       6a. Is the number of abortions not known?
select_one yes_no          prepreg_disease        7. Did the mother suffer any disease before pregnancy?
select_multiple prepreg_di prepreg_disease_types  7a. If yes, which disease(s)?
text                       prepreg_disease_other  Other disease (specify)
select_one last_pregnancy_ last_pregnancy_outcome 8. Outcome of the last pregnancy / delivery
select_multiple complicati q9_header              Complication ▸ phase
select_multiple complicati comp_high_bp           1. High blood pressure
select_multiple complicati comp_diabetes          2. Diabetes
select_multiple complicati comp_abortion          3. Abortion
select_multiple complicati comp_haemorrhage       4. Haemorrhage
select_multiple complicati comp_high_fever        5. High fever
select_multiple complicati comp_oedema            6. Water in face, legs and hands
select_multiple complicati comp_convulsion        7. Convulsion / eclampsia / fainting
select_multiple complicati comp_jaundice          8. Jaundice
select_multiple complicati comp_anaemia           9. Anaemia
select_multiple complicati comp_blurred_vision    10. Blurred vision in the eyes
select_multiple complicati comp_prolonged_labour  11. Labour pain for more than 12 hours
select_multiple complicati comp_reduced_movement  12. Reduced foetal movement or no movement for a long time
select_multiple complicati comp_uterine_rupture   13. Tearing of the uterus
select_multiple complicati comp_malpresentation   14. A part other than the head coming out
select_multiple complicati comp_retained_placenta 15. Retained placenta
select_multiple complicati comp_foul_discharge    16. Foul-smelling discharge
select_multiple complicati comp_abdominal_pain    17. Abnormal (severe) pain in lower abdomen
select_multiple complicati comp_other             18. Other, specify
text                       comp_other_specify     Other complication (specify)
select_one anc_count       anc_count              10. How many times did the mother receive ANC?
select_multiple facility_p anc_place              11. Where was ANC received?
text                       anc_place_other        Other place (specify)
select_multiple provider_c anc_provider           12. Who provided ANC?
text                       anc_provider_other     Other provider (specify)
select_multiple birth_plan birth_plan             13. What birth-plan preparations had been made?
select_one facility_place  delivery_place         14. Where was the delivery conducted?
text                       delivery_place_other   Other place (specify)
select_one provider_cadre  delivery_conductor     15. Who conducted the delivery?
text                       delivery_conductor_oth Other (specify)
select_one delivery_mode   delivery_mode          16. Mode of delivery
select_one delivery_outcom delivery_outcome       17. Outcome of the current pregnancy
select_one yes_no          treatment_received     18. Did the mother receive any treatment before death?
select_multiple facility_p treatment_place        19. If yes, where was treatment received?
text                       treatment_place_other  Other place (specify)
select_multiple provider_c treatment_provider     20. Who provided the treatment?
text                       treatment_provider_oth Other (specify)
select_multiple no_treatme no_treatment_reasons   21. If no treatment was received, why not?
text                       no_treatment_other     Other reason (specify)
integer                    death_after_delivery_d 22. Days after delivery until death
integer                    death_after_delivery_h 22a. Hours
integer                    death_after_delivery_m 22b. Minutes
integer                    pnc_count              23. How many PNC visits did the mother receive?
integer                    pnc_first_days         24. Days after delivery to first PNC
integer                    pnc_first_hours        24a. Hours
select_multiple facility_p pnc_place              25. Where was PNC received?
text                       pnc_place_other        Other place (specify)
select_multiple provider_c pnc_provider           26. Who provided PNC?
text                       pnc_provider_other     Other (specify)
text                       narrative_before_death 27. Describe what happened just before the death (events, co
text                       cause_opinion          28. In your opinion, what caused this maternal death?
text                       certificate_cause      29. If a death certificate was issued, the cause per the cer
select_one icd_cause       icd_cause              Cause
text                       icd_code               ICD code
text                       icd_disease_name       Name of disease
text                       icd_diagnoser_name     Name of person coding
text                       icd_diagnoser_designat Designation
text                       icd_diagnoser_institut Institution
date                       icd_date               Date

========== F02 Community Neonatal ==========
geopoint                   location               GPS location (required — step outside if no signal)
date                       collection_date        Date
select_one district        district               District
text                       upazila                Upazila
text                       union                  Union / Pourashava
text                       ward                   Ward
text                       village                Village / Mahalla
text                       enumerator_name        Your name (person filling this form)
text                       enumerator_designation Designation
text                       enumerator_institution Institution
text                       enumerator_mobile      Mobile number
date                       office_submission_date Date of form submission
text                       case_serial            Annual neonatal death serial number
text                       office_receiver        Name & signature of form receiver
select_one yes_no          consent_given          Consent given by respondent?
date                       interview_date         Date of interview
text                       respondent_mobile      Respondent mobile number
text                       respondent_main_name   Main respondent — name
select_one relationship    respondent_main_rel    Main respondent — relationship with deceased
select_one yes_no          respondent_main_presen Main respondent — present at time of death?
text                       respondent_alt1_name   Associate respondent 1 — name
select_one relationship    respondent_alt1_rel    Associate 1 — relationship
select_one yes_no          respondent_alt1_presen Associate 1 — present at time of death?
text                       respondent_alt2_name   Associate respondent 2 — name
select_one relationship    respondent_alt2_rel    Associate 2 — relationship
select_one yes_no          respondent_alt2_presen Associate 2 — present at time of death?
text                       clinic_name            Community Clinic name
text                       clinic_code            Community Clinic code (must be filled)
text                       mother_name            Mother's name
text                       mother_dhis2_code      Mother's online registration (DHIS-2) coding (must be filled
integer                    mother_age             Mother's age (years)
select_one education_level mother_education       Mother's education
select_one ses             household_ses          Household socio-economic status
text                       father_name            Father's name
integer                    father_age             Father's age (years)
text                       child_name             Child's name
text                       child_dhis2_code       Child's online registration number (DHIS-2)
date                       birth_date             1. Date of birth
time                       birth_time             1. Time of birth (24-hour)
date                       death_date             2. Date of death
time                       death_time             2. Time of death (24-hour)
integer                    age_at_death_days      2. Neonate's age (days) — write <1 if under 24 hours
select_one death_place     death_place            3. Where did the death occur? (tick the correct box)
text                       death_place_other      Other (specify)
integer                    sick_duration_days     4. How long was the neonate sick before death?
select_one yes_no          death_by_injury        5. Did the neonate die from any physical injury?
text                       death_injury_type      5. If yes, what type of injury (specify)
integer                    gestation_month        6. At how many months or weeks of gestation was the delivery
integer                    gestation_week         6. At how many months or weeks of gestation was the delivery
select_multiple pregnancy_ pregnancy_complication 7. Were there any complications related to delivery during t
text                       pregnancy_complication Other (specify)
select_one anc_count       anc_count              8. How many times did you receive antenatal (ANC) care?
select_multiple facility_p anc_place              9. From which place was antenatal care received? (more than 
text                       anc_place_other        Other (specify)
select_multiple provider_c anc_provider           10. Who provided the antenatal care? (more than one answer ✓
text                       anc_provider_other     Other (specify)
integer                    parity                 11. How many times has the mother given birth? Write the num
integer                    abortion_count         12. How many times has the mother had an abortion? Write the
select_one yes_no          abortion_unknown       12. Tick if not known.
select_one facility_place  birth_place            13. Place of birth of the neonate?
text                       birth_place_other      Other (specify)
select_one provider_cadre  delivery_conductor     14. By whom was the delivery conducted?
text                       delivery_conductor_oth Other (specify)
select_one delivery_mode   delivery_mode          15. By which method was the delivery done?
select_multiple delivery_c delivery_complications 16. Did the mother show any complications during delivery? W
select_one yes_no          twin_birth             17. Did the mother deliver twins?
select_one birth_weight_ba birth_weight_band      18. What was the neonate's weight at birth?
select_multiple congenital congenital_defects     19. Were there any congenital defects?
text                       congenital_defect_othe Other (specify)
select_one cried_breathed  cried_breathed         20. After birth, did the neonate cry / breathe?
select_multiple resuscitat resuscitation_actions  21. If the answer was weak cry or breathed after a long time
text                       resuscitation_other    Other (specify)
select_multiple danger_sig danger_signs           22. What danger signs did the neonate show? (more than one t
text                       danger_sign_other      Other (specify)
select_one yes_no          treatment_received     23. Did the child receive any treatment before death?
select_multiple facility_p treatment_place        24. Place where the post-delivery care was received? (more t
text                       treatment_place_other  Other (specify)
select_multiple no_treatme no_treatment_reasons   25. If treatment care was not received, what was the reason?
text                       no_treatment_other     Other (specify)
text                       cause_opinion          26. In your opinion, write the probable cause of this death?
text                       certificate_cause      27. If a death certificate of this neonate exists, what was 
select_one icd_cause       icd_cause              CAUSE
text                       icd_code               ICD code
text                       icd_disease_name       Name of disease
text                       icd_diagnoser_name     Name of identifier
text                       icd_diagnoser_designat Designation
text                       icd_diagnoser_institut Institution
date                       icd_date               Date

========== F04 Facility Maternal ==========
geopoint                   location               GPS location (required — step outside if no signal)
date                       collection_date        Date
select_one district        district               District
text                       upazila                Upazila
text                       union                  Union / Pourashava
text                       ward                   Ward
text                       village                Village / Mahalla
text                       enumerator_name        Your name (person filling this form)
text                       enumerator_designation Designation
text                       enumerator_institution Institution
text                       enumerator_mobile      Mobile number
date                       office_submission_date Date of form submission
text                       case_serial            Annual facility maternal death serial number
text                       office_receiver        Name & signature of form receiver
text                       facility_name          Name of facility
text                       facility_code          Facility code (must be filled — 8 digits)
text                       deceased_name          Mother's name
integer                    deceased_age           Mother's age (years)
text                       mother_hosp_reg_no     Mother's Hospital Registration No. (must be filled)
select_one district        mother_district        District
text                       mother_upazila         Upazila
text                       mother_union           Union / Pourashava
text                       mother_ward            Ward
text                       mother_village         Village
text                       deceased_husband       Husband's name
text                       family_phone           Phone number
date                       er_arrival_date        Date of arrival in Emergency department / OPD
time                       er_arrival_time        Time of arrival in Emergency department / OPD
date                       admission_date         Date of admission in inpatient
time                       admission_time         Time of admission in inpatient
date                       date_of_death          Date of death
time                       time_of_death          Time of death
select_one admission_condi admission_condition    2. Mother's condition at admission
select_one er_pregnancy_st er_pregnancy_status    3. Mother's pregnancy status in OPD / ER
select_multiple admission_ admission_diagnosis    4. Diagnosis at admission
select_one retained_placen admission_retained_pla 4a. Retained placenta: with or without haemorrhage
text                       admission_diagnosis_ot Others (Specify):
select_one yes_no          referred_in            5. Was the admitted mother referred in?
select_one referral_source referral_source        5a. If yes, from where was she referred?
text                       referral_source_other  অন্যান্য
select_one yes_no          first_obs_recorded     6. Is the date/time of first observation recorded?
date                       first_obs_date         6a. Date of first observation
time                       first_obs_time         6b. Time of first observation
select_multiple inpatient_ inpatient_diagnosis    7. Disease / problem diagnosed in the inpatient ward
select_one retained_placen inpatient_retained_pla 7a. Retained placenta: with or without haemorrhage
text                       inpatient_diagnosis_ot Others (Specify):
select_one yes_no          management_recorded    8. Is the date/time management started recorded?
date                       management_start_date  8a. Date management started
time                       management_start_time  8b. Time management started
select_one delivery_mode   delivery_mode          9. Mode of delivery
select_one delivery_outcom delivery_outcome       10. Outcome of the current pregnancy
text                       delivery_outcome_other অন্যান্য উল্লেখ করুন
integer                    birth_weight_grams     11. Baby's birth weight (grams)
select_one yes_no          baby_abnormality       12. Was there any abnormality in the baby after birth?
select_one death_place_fac death_place_facility   13. Place of the mother's death
text                       death_place_facility_o অন্যান্য
select_multiple icd_cause  cause_of_death         CAUSE
text                       cause_of_death_other   Other cause (specify + ICD code)
text                       death_narrative        15. Comments (describe the death in brief)
text                       filler_name            16. Name of person filling the form
text                       filler_designation     Designation
date                       filler_date            Date of data collection

========== F05 Facility Neonatal ==========
geopoint                   location               GPS location (required — step outside if no signal)
date                       collection_date        Date
select_one district        district               District
text                       upazila                Upazila
text                       union                  Union / Pourashava
text                       ward                   Ward
text                       village                Village / Mahalla
text                       enumerator_name        Your name (person filling this form)
text                       enumerator_designation Designation
text                       enumerator_institution Institution
text                       enumerator_mobile      Mobile number
date                       office_submission_date Date of form submission
text                       case_serial            Annual neonatal death serial number
text                       office_receiver        Name & signature of form receiver
text                       facility_name          Name of facility
text                       facility_code          Facility code
text                       mother_name            Mother's name
integer                    mother_age             Mother's age (years)
text                       neonate_name           Neonate's name
integer                    age_death_days         Day
integer                    age_death_hours        Hour
integer                    age_death_minutes      Minute
text                       hospital_reg_no        Mother / neonate hospital registration number
text                       hospital_ward_no       Hospital ward number
text                       hospital_bed_no        Hospital bed number
select_one district        mother_district        District
text                       mother_upazila         Upazila
text                       mother_union           Union / Pourashava
text                       mother_ward            Ward
text                       mother_village         Village
text                       father_name            Father's name
text                       family_phone           Phone number
select_one birth_place     birth_place            1. Place of birth of the neonate?
text                       birth_place_other      Other (specify)
select_one death_type      death_type             2. What type of neonatal death was it? (If applicable, tick.
select_one recorded_status er_arrival_recorded    3. Was the ER / emergency arrival recorded?
date                       er_arrival_date        3. Date brought to ER / emergency department
time                       er_arrival_time        Time
select_one recorded_status admission_recorded     4. Was the inpatient admission recorded?
date                       admission_date         4. Date of inpatient admission
time                       admission_time         Time
select_one recorded_status death_datetime_recorde 5. Was the date / time of death recorded?
date                       death_date             5. Date of death
time                       death_time             Time
select_one admission_condi admission_condition    6. Condition of the neonate at admission
select_multiple admission_ admission_diagnosis    7. What disease was diagnosed at the admission of the neonat
text                       admission_diagnosis_ot Others (specify)
select_one yes_no          referred_in            8. Was the neonate a referred patient? (✓ tick)
select_one referral_source referral_source        9. If yes, from where was it referred? (✓ tick)
text                       referral_source_other  Other (specify)
select_one doctor_observed doctor_observed        10. When did a doctor / consultant first observe the neonate
date                       doctor_observe_date    10. Date
time                       doctor_observe_time    Time (24h)
select_multiple danger_sig danger_signs           11. Did the neonate have any danger sign? (tick the correct 
text                       danger_signs_other     Other (specify)
select_multiple specialist specialist_diagnosis   12. What disease was diagnosed for the neonate by the specia
text                       specialist_diagnosis_o Others (specify)
date                       treatment_start_date   13. How long after admission did hospital inpatient-departme
time                       treatment_start_time   Time (24h)
integer                    birth_weight_grams     14. Weight of the child after birth (grams)
select_one yes_no          congenital_anomaly     15. Did the neonate have any congenital anomaly?
select_multiple anomaly_si anomaly_site           16. If yes, where was the congenital anomaly?
text                       anomaly_site_other     Other (specify)
select_one place_of_death_ place_of_death_facilit 17. In which department or place of the hospital did the neo
text                       place_of_death_other   Other place (specify)
select_multiple cod_cause  cod_cause              18. Most probable cause of death: (you may tick more than on
text                       cause_name             Name of disease
text                       icd10_code             ICD 10 code no.
text                       death_narrative        20. Write briefly the description of the patient's death eve
text                       reviewer_name          Name of death reviewer
text                       reviewer_designation   Designation
date                       data_collection_date   Date of data collection