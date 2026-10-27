/**
 * Minimum Wage Earner rates, as Annex A (Sub Module 1, sheet "D2. MWE 2026
 * Updated Table") lays them out: a rate belongs to a Region, a Locality
 * (City, Municipality or Province) and its names, an optional Municipalities
 * Classification and a Sector, and a wage order may raise it in two tranches.
 *
 * The MWE Management register (Settings › Statutory Tables) and the Basic Pay
 * entry in the Employee Masterfile both read from here, so the dropdowns an
 * employee is placed with and the rate the warning compares against are the
 * same rows.
 */

/** Column order of a register row, as in Annex A. */
export const MWE_COLUMNS = Object.freeze([
  'code', 'region', 'locality', 'localityName', 'classification', 'sector', 'currency',
  'dailyRate', 'effectiveDate', 'dailyRate2', 'effectiveDate2', 'oldRate', 'newRate', 'increaseRate',
  'wageOrder', 'status', 'remarks', 'url',
]);

export const MWE_LOCALITIES = Object.freeze(['City', 'Municipality', 'Province']);

/** Annex A, as of the 2026 table. Old Rate is the rate before the wage order's 1st tranche. */
export const MWE_RATE_ROWS = Object.freeze([
  ['MWE-2026-001', 'NCR', 'City', 'Caloocan, Manila, Malabon, Paranaque, Quezon, Valenzuela, Las Pinas, Makati, Muntinlupa, Pasay, San Juan, Mandaluyong, Marikina, Navotas, Pasig, Taguig', '', 'Non-Agriculture', 'PHP', '695', '2025-07-18', '', '', '645', '', '', 'Wage Order No. NCR-26', 'Active', '', 'https://nwpc.dole.gov.ph/ncr/'],
  ['MWE-2026-002', 'NCR', 'Municipality', 'Pateros', '', 'Non-Agriculture', 'PHP', '695', '2025-07-18', '', '', '645', '', '', 'Wage Order No. NCR-26', 'Active', '', 'https://nwpc.dole.gov.ph/ncr/'],
  ['MWE-2026-003', 'NCR', 'City', 'Caloocan, Manila, Malabon, Paranaque, Quezon, Valenzuela, Las Pinas, Makati, Muntinlupa, Pasay, San Juan, Mandaluyong, Marikina, Navotas, Pasig, Taguig', '', 'Agriculture (Plantation and Non-Plantation); Service/Retail employing 15 workers or less; Manufacturing employing less than 10 workers', 'PHP', '658', '2025-07-18', '', '', '608', '', '', 'Wage Order No. NCR-26', 'Active', '', 'https://nwpc.dole.gov.ph/ncr/'],
  ['MWE-2026-004', 'NCR', 'Municipality', 'Pateros', '', 'Agriculture (Plantation and Non-Plantation); Service/Retail employing 15 workers or less; Manufacturing employing less than 10 workers', 'PHP', '658', '2025-07-18', '', '', '608', '', '', 'Wage Order No. NCR-26', 'Active', '', 'https://nwpc.dole.gov.ph/ncr/'],
  ['MWE-2026-005', 'CAR', 'City', 'Baguio', '', 'All Sectors', 'PHP', '505', '2025-12-30', '', '', '470', '', '', 'Wage Order No. CAR-24', 'Active', '', 'https://nwpc.dole.gov.ph/car/'],
  ['MWE-2026-006', 'CAR', 'Municipality', 'Abra, Benguet, Kalinga, Apayao, Ifugao, Mountain Province', '', 'All Sectors', 'PHP', '505', '2025-12-30', '', '', '470', '', '', 'Wage Order No. CAR-24', 'Active', '', 'https://nwpc.dole.gov.ph/car/'],
  ['MWE-2026-007', 'Region I – Ilocos Region', 'City', 'Alaminos, Batac, Candon, Dagupan, Laoag, San Carlos, San Fernando, Urdaneta, Vigan', '', 'Non-Agriculture employing 10 or more employees', 'PHP', '505', '2026-11-19', '', '', '468', '', '', 'Wage Order No. RB 1-24', 'Active', '', 'https://nwpc.dole.gov.ph/region-i/'],
  ['MWE-2026-008', 'Region I – Ilocos Region', 'Province', 'Ilocos Norte, Ilocos Sur, La Union, Pangasinan', '', 'Non-Agriculture employing 10 or more employees', 'PHP', '505', '2026-11-19', '', '', '468', '', '', 'Wage Order No. RB 1-24', 'Active', '', 'https://nwpc.dole.gov.ph/region-i/'],
  ['MWE-2026-009', 'Region I – Ilocos Region', 'City', 'Alaminos, Batac, Candon, Dagupan, Laoag, San Carlos, San Fernando, Urdaneta, Vigan', '', 'Non-Agriculture employing less than 10 employees; and Agriculture', 'PHP', '480', '2026-11-19', '', '', '435', '', '', 'Wage Order No. RB 1-24', 'Active', '', 'https://nwpc.dole.gov.ph/region-i/'],
  ['MWE-2026-010', 'Region I – Ilocos Region', 'Province', 'Ilocos Norte, Ilocos Sur, La Union, Pangasinan', '', 'Non-Agriculture employing less than 10 employees; and Agriculture', 'PHP', '480', '2026-11-19', '', '', '435', '', '', 'Wage Order No. RB 1-24', 'Active', '', 'https://nwpc.dole.gov.ph/region-i/'],
  ['MWE-2026-011', 'Region II – Cagayan Valley', 'City', 'Cauayan, Ilagan, Santiago, Tuguegarao', '', 'Non-Agriculture and Agriculture', 'PHP', '500', '2025-11-05', '', '', '480', '', '', 'Wage Order No. RTWPB 2-24', 'Active', '', 'https://nwpc.dole.gov.ph/region-ii/'],
  ['MWE-2026-012', 'Region II – Cagayan Valley', 'Province', 'Batanes, Isabela, Nueva Vizcaya, Cagayan, Quirino', '', 'Non-Agriculture and Agriculture', 'PHP', '500', '2025-11-05', '', '', '460', '', '', 'Wage Order No. RTWPB 2-24', 'Active', '', 'https://nwpc.dole.gov.ph/region-ii/'],
  ['MWE-2026-013', 'Region III – Central Luzon', 'City', 'Angeles, Balanga, Cabanatuan, Gapan, Malolos, Munoz, Olongapo, Palayan, San Fernando, San Jose, San Jose Del Monte, Tarlac', '', 'Non-Agriculture', 'PHP', '570', '2025-10-30', '600', '2026-04-16', '550', '', '', 'Wage Order No. RBIII-26', 'Active', '', 'https://nwpc.dole.gov.ph/region-iii/'],
  ['MWE-2026-014', 'Region III – Central Luzon', 'Municipality', 'Bulacan, Bataan, Nueva Ecija, Pampanga, Tarlac, Zambales', '', 'Non-Agriculture', 'PHP', '570', '2025-10-30', '600', '2026-04-16', '550', '', '', 'Wage Order No. RBIII-26', 'Active', '', 'https://nwpc.dole.gov.ph/region-iii/'],
  ['MWE-2026-015', 'Region III – Central Luzon', 'City', 'Angeles, Balanga, Cabanatuan, Gapan, Malolos, Munoz, Olongapo, Palayan, San Fernando, San Jose, San Jose Del Monte, Tarlac', '', 'Agriculture', 'PHP', '540', '2025-10-30', '570', '2026-04-16', '520', '', '', 'Wage Order No. RBIII-26', 'Active', '', 'https://nwpc.dole.gov.ph/region-iii/'],
  ['MWE-2026-016', 'Region III – Central Luzon', 'Municipality', 'Bulacan, Bataan, Nueva Ecija, Pampanga, Tarlac, Zambales', '', 'Agriculture', 'PHP', '540', '2025-10-30', '570', '2026-04-16', '520', '', '', 'Wage Order No. RBIII-26', 'Active', '', 'https://nwpc.dole.gov.ph/region-iii/'],
  ['MWE-2026-017', 'Region III – Central Luzon', 'City', 'Angeles, Balanga, Cabanatuan, Gapan, Malolos, Munoz, Olongapo, Palayan, San Fernando, San Jose, San Jose Del Monte, Tarlac', '', 'Retail/Service', 'PHP', '560', '2025-10-30', '590', '2026-04-16', '540', '', '', 'Wage Order No. RBIII-26', 'Active', '', 'https://nwpc.dole.gov.ph/region-iii/'],
  ['MWE-2026-018', 'Region III – Central Luzon', 'Municipality', 'Bulacan, Bataan, Nueva Ecija, Pampanga, Tarlac, Zambales', '', 'Retail/Service', 'PHP', '560', '2025-10-30', '590', '2026-04-16', '540', '', '', 'Wage Order No. RBIII-26', 'Active', '', 'https://nwpc.dole.gov.ph/region-iii/'],
  ['MWE-2026-019', 'Region III – Central Luzon', 'Province', 'Aurora', '', 'Non-Agriculture', 'PHP', '530', '2025-10-30', '560', '2026-04-16', '500', '', '', 'Wage Order No. RBIII-26', 'Active', '', 'https://nwpc.dole.gov.ph/region-iii/'],
  ['MWE-2026-020', 'Region III – Central Luzon', 'Province', 'Aurora', '', 'Agriculture', 'PHP', '515', '2025-10-30', '545', '2026-04-16', '485', '', '', 'Wage Order No. RBIII-26', 'Active', '', 'https://nwpc.dole.gov.ph/region-iii/'],
  ['MWE-2026-021', 'Region III – Central Luzon', 'Province', 'Aurora', '', 'Retail/Service', 'PHP', '475', '2025-10-30', '515', '2026-04-16', '435', '', '', 'Wage Order No. RBIII-26', 'Active', '', 'https://nwpc.dole.gov.ph/region-iii/'],
  ['MWE-2026-022', 'Region IV A – CALABARZON', 'Province', 'Batangas, Cavite, Laguna, Quezon, Rizal', 'Extended Metropolitan Area', 'Non-Agriculture', 'PHP', '600', '2026-10-05', '', '', '560', '', '', 'Wage Order No. IVA-22', 'Active', 'Covers: Province of Cavite; (City of Bacoor, City of Dasmarinas, City of Imus); Province of Laguna; (City of Binan, City of San Pedro, Laguna Techno Park); Province of Rizal; (Cainta, City of Antipolo, Taytay', 'https://nwpc.dole.gov.ph/region-iva/'],
  ['MWE-2026-023', 'Region IV A – CALABARZON', 'Province', 'Batangas, Cavite, Laguna, Quezon, Rizal', 'Component Cities', 'Non-Agriculture', 'PHP', '600', '2026-10-05', '', '', '540', '', '', 'Wage Order No. IVA-22', 'Active', 'Covers: Province of Cavite; (Cavite City, City of Carmona, City of General Trias, Tagaytay City, Trece Martines City; Province of Laguna; (City of Cabuyao, City of Calamba, City of Santa Rosa, San Pablo City; Province of Batangas; (Batangas City, City of Calaca, City of Tanauan, City of Santo Tomas, LIMA Technology Center, Lipa City); Province of Quezon; (City of Tayabas, Lucena City)', 'https://nwpc.dole.gov.ph/region-iva/'],
  ['MWE-2026-024', 'Region IV A – CALABARZON', 'Province', 'Batangas, Cavite, Laguna, Quezon, Rizal', '1st Class Municipalities', 'Non-Agriculture', 'PHP', '550', '2026-10-05', '', '', '520', '', '', 'Wage Order No. IVA-22', 'Active', 'Covers: Province of Cavite; (Alfonso, Gen. Mariano Alvarez, Indang, Kawit, Naic, Rosario, Silang, Tanza; Province of Laguna; (Los Ballos, Santa Cruz); Province of Batangas; (Balayan, Bauan, Lemery, Mabini, Nasugbu, Rosario, San Jose, San Juan, San Pascual); Province of Rizal; (Angono, Binangonan, Pilila, Rodriguez, San Mateo, Tanay; Province of Quezon; (Atimonan, Calauag, Candelaria, Catanauan, General Nakar, Gumaca, Infanta, Lopez, Mauban, Mulanay, Pagbilao, Real, Sariaya,Tagkawayan, Tiaong)', 'https://nwpc.dole.gov.ph/region-iva/'],
  ['MWE-2026-025', 'Region IV A – CALABARZON', 'Province', 'Batangas, Cavite, Laguna, Quezon, Rizal', 'Reclassified 1st Class Municipalities', 'Non-Agriculture', 'PHP', '550', '2026-04-01', '', '', '450', '', '', 'Wage Order No. IVA-22', 'Active', 'Covers: Province of Cavite; (Noveleta); Province of Laguna; (Alaminos, Bay, Calauan, Negcarlan, Pila, Siniloan); Province of Batangas; (Calatagan, Ibaan, Lian, Lobo, Malvar, Padre Garcia, Taal, Talisay, Taysan); Province of Rizal; (Baras, Morong, Teresa); Province of Quezon; (Guinayangan, Lucban, Polillo, San Francisco, San Narciso)', 'https://nwpc.dole.gov.ph/region-iva/'],
  ['MWE-2026-026', 'Region IV A – CALABARZON', 'Province', 'Batangas, Cavite, Laguna, Quezon, Rizal', '2nd to 5th Class Municipalities', 'Non-Agriculture', 'PHP', '525', '2026-04-01', '', '', '450', '', '', 'Wage Order No. IVA-22', 'Active', 'Covers: Province of Cavite; (Amadeo, Gen. Emilio Aguinaldo, Magallanes, Maragodon, Mendez, Ternate); Province of Laguna; (Cavinti, Famy, Kalayaan, Liliw, Luisiana, Lumban, Mabitac, Magdalena, Majayjay, Paete, Pagsanjan, Pakil, Pangil, Rizal, Santa Maria, Victoria; Province of Batangas; (Agoncillo, Alitagtag, Balete, Cuenca, Laurel, Mataas na kahoy, San Luis, San Nicolas, Santa Teresita, Tingloy, Tuy); Province of rizal; (Cardona, Jala-Jala); Province of Quezon; (Agdangan, Alabat, Buenavista, Burdeos, Dolores, General Luna, Jomalig, Macalelon, Padre Burgos, Panukulan, Patnanungan, Perez, Plaridel, Pitogo, Quezon, Sampaloc, San Andres, San Antonio, Unisan', 'https://nwpc.dole.gov.ph/region-iva/'],
  ['MWE-2026-027', 'Region IV A – CALABARZON', 'Province', 'Batangas, Cavite, Laguna, Quezon, Rizal', 'Extended Metropolitan Area', 'Agriculture', 'PHP', '525', '2026-10-05', '', '', '500', '', '', 'Wage Order No. IVA-22', 'Active', 'Covers: Province of Cavite; (City of Bacoor, City of Dasmarinas, City of Imus); Province of Laguna; (City of Binan, City of San Pedro, Laguna Techno Park); Province of Rizal; (Cainta, City of Antipolo, Taytay', 'https://nwpc.dole.gov.ph/region-iva/'],
  ['MWE-2026-028', 'Region IV A – CALABARZON', 'Province', 'Batangas, Cavite, Laguna, Quezon, Rizal', 'Component Cities', 'Agriculture', 'PHP', '525', '2026-10-05', '', '', '500', '', '', 'Wage Order No. IVA-22', 'Active', 'Covers: Province of Cavite; (Cavite City, City of Carmona, City of General Trias, Tagaytay City, Trece Martines City; Province of Laguna; (City of Cabuyao, City of Calamba, City of Santa Rosa, San Pablo City; Province of Batangas; (Batangas City, City of Calaca, City of Tanauan, City of Santo Tomas, LIMA Technology Center, Lipa City); Province of Quezon; (City of Tayabas, Lucena City)', 'https://nwpc.dole.gov.ph/region-iva/'],
  ['MWE-2026-029', 'Region IV A – CALABARZON', 'Province', 'Batangas, Cavite, Laguna, Quezon, Rizal', '1st Class Municipalities', 'Agriculture', 'PHP', '525', '2026-10-05', '', '', '500', '', '', 'Wage Order No. IVA-22', 'Active', 'Covers: Province of Cavite; (Alfonso, Gen. Mariano Alvarez, Indang, Kawit, Naic, Rosario, Silang, Tanza; Province of Laguna; (Los Ballos, Santa Cruz); Province of Batangas; (Balayan, Bauan, Lemery, Mabini, Nasugbu, Rosario, San Jose, San Juan, San Pascual); Province of Rizal; (Angono, Binangonan, Pilila, Rodriguez, San Mateo, Tanay; Province of Quezon; (Atimonan, Calauag, Candelaria, Catanauan, General Nakar, Gumaca, Infanta, Lopez, Mauban, Mulanay, Pagbilao, Real, Sariaya,Tagkawayan, Tiaong)', 'https://nwpc.dole.gov.ph/region-iva/'],
  ['MWE-2026-030', 'Region IV A – CALABARZON', 'Province', 'Batangas, Cavite, Laguna, Quezon, Rizal', 'Reclassified 1st Class Municipalities', 'Agriculture', 'PHP', '525', '2026-04-01', '', '', '425', '', '', 'Wage Order No. IVA-22', 'Active', 'Covers: Province of Cavite; (Noveleta); Province of Laguna; (Alaminos, Bay, Calauan, Negcarlan, Pila, Siniloan); Province of Batangas; (Calatagan, Ibaan, Lian, Lobo, Malvar, Padre Garcia, Taal, Talisay, Taysan); Province of Rizal; (Baras, Morong, Teresa); Province of Quezon; (Guinayangan, Lucban, Polillo, San Francisco, San Narciso)', 'https://nwpc.dole.gov.ph/region-iva/'],
  ['MWE-2026-031', 'Region IV A – CALABARZON', 'Province', 'Batangas, Cavite, Laguna, Quezon, Rizal', '2nd to 5th Class Municipalities', 'Agriculture', 'PHP', '508', '2026-04-01', '', '', '425', '', '', 'Wage Order No. IVA-22', 'Active', 'Covers: Province of Cavite; (Amadeo, Gen. Emilio Aguinaldo, Magallanes, Maragodon, Mendez, Ternate); Province of Laguna; (Cavinti, Famy, Kalayaan, Liliw, Luisiana, Lumban, Mabitac, Magdalena, Majayjay, Paete, Pagsanjan, Pakil, Pangil, Rizal, Santa Maria, Victoria; Province of Batangas; (Agoncillo, Alitagtag, Balete, Cuenca, Laurel, Mataas na kahoy, San Luis, San Nicolas, Santa Teresita, Tingloy, Tuy); Province of rizal; (Cardona, Jala-Jala); Province of Quezon; (Agdangan, Alabat, Buenavista, Burdeos, Dolores, General Luna, Jomalig, Macalelon, Padre Burgos, Panukulan, Patnanungan, Perez, Plaridel, Pitogo, Quezon, Sampaloc, San Andres, San Antonio, Unisan', 'https://nwpc.dole.gov.ph/region-iva/'],
  ['MWE-2026-032', 'Region IV A – CALABARZON', 'Province', 'Batangas, Cavite, Laguna, Quezon, Rizal', '', 'Retail and Service Establishments Regularly Employing not more than 10 Workers', 'PHP', '508', '2026-04-01', '', '', '425', '', '', 'Wage Order No. IVA-22', 'Active', '', 'https://nwpc.dole.gov.ph/region-iva/'],
  ['MWE-2026-033', 'Region IV B – MIMAROPA Region', 'City', 'Calapan, Highly Urbanized City of Puerto Princesa', '', 'Establishments with 10 workers and above', 'PHP', '455', '2026-01-01', '', '', '430', '', '', 'Wage Order No. RB-MIMAROPA-DW-06', 'Active', '', 'https://nwpc.dole.gov.ph/region-ivb/'],
  ['MWE-2026-034', 'Region IV B – MIMAROPA Region', 'Province', 'Marinduque, Occidental Mindoro, Oriental Mindoro, Palawan, Romblon', '', 'Establishments with less than 10 workers', 'PHP', '455', '2026-01-01', '', '', '404', '', '', 'Wage Order No. RB-MIMAROPA-DW-06', 'Active', '', 'https://nwpc.dole.gov.ph/region-ivb/'],
  ['MWE-2026-035', 'Region V – Bicol Region', 'City', 'Iriga, Legazpi, Ligao, Masbate, Naga, Sorsogon, Tabaco', '', 'All Sectors', 'PHP', '455', '2026-04-08', '480', '2026-12-01', '435', '', '', 'Wage Order No. V-23', 'Active', '', 'https://nwpc.dole.gov.ph/region-v/'],
  ['MWE-2026-036', 'Region V – Bicol Region', 'Province', 'Albay, Camarines Norte, Camarines Sur, Catanduanes, Masbate, Sorsogon', '', 'All Sectors', 'PHP', '455', '2026-04-08', '480', '2026-12-01', '435', '', '', 'Wage Order No. V-23', 'Active', '', 'https://nwpc.dole.gov.ph/region-v/'],
  ['MWE-2026-037', 'Region VI – Western Visayas', 'City', 'Component Cities, Highly Urbanized City of Iloilo and Bacolod', '', 'Employing more than ten (10) workers', 'PHP', '550', '2025-11-19', '', '', '513', '', '', 'Wage Order No. RBVI-29', 'Active', '', 'https://nwpc.dole.gov.ph/region-vi/'],
  ['MWE-2026-038', 'Region VI – Western Visayas', 'Province', 'Aklan, Antique, Capiz, Guimaras, Iloilo, Negros Occidental', '', 'Employing more than ten (10) workers', 'PHP', '550', '2025-11-19', '', '', '513', '', '', 'Wage Order No. RBVI-29', 'Active', '', 'https://nwpc.dole.gov.ph/region-vi/'],
  ['MWE-2026-039', 'Region VI – Western Visayas', 'City', 'Component Cities, Highly Urbanized City of Iloilo and Bacolod', '', 'Employing ten (10) workers or less', 'PHP', '525', '2025-11-19', '', '', '485', '', '', 'Wage Order No. RBVI-29', 'Active', '', 'https://nwpc.dole.gov.ph/region-vi/'],
  ['MWE-2026-040', 'Region VI – Western Visayas', 'Province', 'Aklan, Antique, Capiz, Guimaras, Iloilo, Negros Occidental', '', 'Employing ten (10) workers or less', 'PHP', '525', '2025-11-19', '', '', '485', '', '', 'Wage Order No. RBVI-29', 'Active', '', 'https://nwpc.dole.gov.ph/region-vi/'],
  ['MWE-2026-041', 'Region VI – Western Visayas', 'City', 'Component Cities, Highly Urbanized City of Iloilo and Bacolod', '', 'Agriculture', 'PHP', '520', '2025-11-19', '', '', '480', '', '', 'Wage Order No. RBVI-29', 'Active', '', 'https://nwpc.dole.gov.ph/region-vi/'],
  ['MWE-2026-042', 'Region VI – Western Visayas', 'Province', 'Aklan, Antique, Capiz, Guimaras, Iloilo, Negros Occidental', '', 'Agriculture', 'PHP', '520', '2025-11-19', '', '', '480', '', '', 'Wage Order No. RBVI-29', 'Active', '', 'https://nwpc.dole.gov.ph/region-vi/'],
  ['MWE-2026-043', 'Region VII – Central Visayas', 'City', 'Bais, Bayawan, Bogo, Canlaon, Carcar, Cebu, Dumaguete, Danao, Guihulingan, Lapu-Lapu, Mandaue, Naga, Tagbilaran, Talisay, Tanjay, Toledo', 'Class A', 'All Sectors', 'PHP', '540', '2026-10-04', '', '', '501', '', '', 'Wage Order No. ROVII-26', 'Active', 'Class A: Cities of Carcar, Cebu, Danao, Lapu-Lapu, Mandaue, Naga, Talisay and Municipalities of Compostela, Consolacion, Cordova, Liloan, Minglanilla, San Fernando (Expanded Metro Cebu)', 'https://nwpc.dole.gov.ph/region-vii/'],
  ['MWE-2026-044', 'Region VII – Central Visayas', 'Province', 'Compostela, Consolacion, Cordova, Liloan, Minglanilla, Negros Oriental Province, San Fernando or Expanded Metro Cebu, Other Municipalities', 'Class A', 'All Sectors', 'PHP', '540', '2026-10-04', '', '', '501', '', '', 'Wage Order No. ROVII-26', 'Active', 'Class A: Cities of Carcar, Cebu, Danao, Lapu-Lapu, Mandaue, Naga, Talisay and Municipalities of Compostela, Consolacion, Cordova, Liloan, Minglanilla, San Fernando (Expanded Metro Cebu)', 'https://nwpc.dole.gov.ph/region-vii/'],
  ['MWE-2026-045', 'Region VII – Central Visayas', 'City', 'Bais, Bayawan, Bogo, Canlaon, Carcar, Cebu, Dumaguete, Danao, Guihulingan, Lapu-Lapu, Mandaue, Naga, Tagbilaran, Talisay, Tanjay, Toledo', 'Class B', 'All Sectors', 'PHP', '500', '2026-10-04', '', '', '463', '', '', 'Wage Order No. ROVII-26', 'Active', 'Class B: other cities and municipalities not covered under Class A', 'https://nwpc.dole.gov.ph/region-vii/'],
  ['MWE-2026-046', 'Region VII – Central Visayas', 'Province', 'Compostela, Consolacion, Cordova, Liloan, Minglanilla, Negros Oriental Province, San Fernando or Expanded Metro Cebu, Other Municipalities', 'Class B', 'All Sectors', 'PHP', '500', '2026-10-04', '', '', '463', '', '', 'Wage Order No. ROVII-26', 'Active', 'Class B: other cities and municipalities not covered under Class A', 'https://nwpc.dole.gov.ph/region-vii/'],
  ['MWE-2026-047', 'Region VIII – Eastern Visayas', 'City', 'Calbayog, Catbalogan, Baybay, Borongan, Maasin, Ormoc, Tacloban, Biliran', '', 'Non-Agriculture; Service/Retail employing more than 10 workers', 'PHP', '452', '2025-12-08', '470', '2026-06-01', '435', '', '', 'Wage Order No. VIII-25', 'Active', '', 'https://nwpc.dole.gov.ph/region-viii/'],
  ['MWE-2026-048', 'Region VIII – Eastern Visayas', 'Province', 'Biliran, Eastern Samar, Leyte, Northern Samar, Samar, Southern Leyte', '', 'Non-Agriculture; Service/Retail employing more than 10 workers', 'PHP', '452', '2025-12-08', '470', '2026-06-01', '435', '', '', 'Wage Order No. VIII-25', 'Active', '', 'https://nwpc.dole.gov.ph/region-viii/'],
  ['MWE-2026-049', 'Region VIII – Eastern Visayas', 'City', 'Calbayog, Catbalogan, Baybay, Borongan, Maasin, Ormoc, Tacloban, Biliran', '', 'Service/Retail employing 1 to 10 workers; Cottage and Handicraft; Agriculture', 'PHP', '422', '2025-12-08', '440', '2026-06-01', '405', '', '', 'Wage Order No. VIII-25', 'Active', '', 'https://nwpc.dole.gov.ph/region-viii/'],
  ['MWE-2026-050', 'Region VIII – Eastern Visayas', 'Province', 'Biliran, Eastern Samar, Leyte, Northern Samar, Samar, Southern Leyte', '', 'Service/Retail employing 1 to 10 workers; Cottage and Handicraft; Agriculture', 'PHP', '422', '2025-12-08', '440', '2026-06-01', '405', '', '', 'Wage Order No. VIII-25', 'Active', '', 'https://nwpc.dole.gov.ph/region-viii/'],
  ['MWE-2026-051', 'Region IX – Zamboanga Peninsula', 'City', 'Dapitan City, Dipolog City, Isabela, Pagadian, Zamboanga', '', 'Non-Agricultural (including Retail/Service employing 10 or more workers)', 'PHP', '439', '2026-01-01', '464', '2026-06-01', '414', '', '', 'Wage Order No. RIX-24', 'Active', '', 'https://nwpc.dole.gov.ph/region-ix/'],
  ['MWE-2026-052', 'Region IX – Zamboanga Peninsula', 'Province', 'Zamboanga Del Norte, Zamboanga Del Sur, Zamboanga Sibugay', '', 'Non-Agricultural (including Retail/Service employing 10 or more workers)', 'PHP', '439', '2026-01-01', '464', '2026-06-01', '414', '', '', 'Wage Order No. RIX-24', 'Active', '', 'https://nwpc.dole.gov.ph/region-ix/'],
  ['MWE-2026-053', 'Region IX – Zamboanga Peninsula', 'City', 'Dapitan City, Dipolog City, Isabela, Pagadian, Zamboanga', '', 'Agricultural (including Retail/Service employing 1 to 9 workers)', 'PHP', '426', '2026-01-01', '451', '2026-06-01', '401', '', '', 'Wage Order No. RIX-24', 'Active', '', 'https://nwpc.dole.gov.ph/region-ix/'],
  ['MWE-2026-054', 'Region IX – Zamboanga Peninsula', 'Province', 'Zamboanga Del Norte, Zamboanga Del Sur, Zamboanga Sibugay', '', 'Agricultural (including Retail/Service employing 1 to 9 workers)', 'PHP', '426', '2026-01-01', '451', '2026-06-01', '401', '', '', 'Wage Order No. RIX-24', 'Active', '', 'https://nwpc.dole.gov.ph/region-ix/'],
  ['MWE-2026-055', 'Region X – Northern Mindanao', 'City', 'Cagayan de Oro, Iligan, Malaybalay, Valencia, Gingoog, El Salvador, Ozamiz', 'Wage Category I', 'Non-Agriculture and Agriculture', 'PHP', '486', '2026-01-16', '500', '2026-05-01', '461', '', '', 'Wage Order No. RX-24', 'Active', '', 'https://nwpc.dole.gov.ph/region-x/'],
  ['MWE-2026-056', 'Region X – Northern Mindanao', 'Municipality', 'Maramag, Quezon, Villanueva, Jasaan, Opol, Lugait, Tagoloan, Manolo Fortich', 'Wage Category I', 'Non-Agriculture and Agriculture', 'PHP', '486', '2026-01-16', '500', '2026-05-01', '461', '', '', 'Wage Order No. RX-24', 'Active', '', 'https://nwpc.dole.gov.ph/region-x/'],
  ['MWE-2026-057', 'Region X – Northern Mindanao', 'Province', 'Bukidnon, Camiguin, Lanao Del Norte, Misamis Occidental, Misamis Oriental, Balingasag, Laguindingan, Mambajao', 'Wage Category II', 'All Retail and Service Establishments employing not more than ten (10) workers', 'PHP', '471', '2026-01-16', '485', '2026-05-01', '446', '', '', 'Wage Order No. RX-24', 'Active', '', 'https://nwpc.dole.gov.ph/region-x/'],
  ['MWE-2026-058', 'Region XI – Davao Region', 'City', 'Davao, Digos, Island Garden of Samal, Mati, Panabo, Tagum', '', 'Non-Agriculture', 'PHP', '525', '2026-03-13', '540', '2026-09-01', '510', '', '', 'Wage Order No. RB XI-24', 'Active', '', 'https://nwpc.dole.gov.ph/region-xi/'],
  ['MWE-2026-059', 'Region XI – Davao Region', 'Province', 'Compostela Valley, Davao Del Sure, Davao Del Norte, Davao Oriental', '', 'Non-Agriculture', 'PHP', '525', '2026-03-13', '540', '2026-09-01', '510', '', '', 'Wage Order No. RB XI-24', 'Active', '', 'https://nwpc.dole.gov.ph/region-xi/'],
  ['MWE-2026-060', 'Region XI – Davao Region', 'City', 'Davao, Digos, Island Garden of Samal, Mati, Panabo, Tagum', '', 'Agriculture', 'PHP', '515', '2026-03-13', '525', '2026-09-01', '505', '', '', 'Wage Order No. RB XI-24', 'Active', '', 'https://nwpc.dole.gov.ph/region-xi/'],
  ['MWE-2026-061', 'Region XI – Davao Region', 'Province', 'Compostela Valley, Davao Del Sure, Davao Del Norte, Davao Oriental', '', 'Agriculture', 'PHP', '515', '2026-03-13', '525', '2026-09-01', '505', '', '', 'Wage Order No. RB XI-24', 'Active', '', 'https://nwpc.dole.gov.ph/region-xi/'],
  ['MWE-2026-062', 'Region XII – SOCCSKSARGEN', 'City', 'General santos, Kidapawan, Koronadal, Tacurong', '', 'Non-Agriculture', 'PHP', '450', '2025-11-02', '460', '2026-12-15', '430', '', '', 'Wage Order No. XII-25', 'Active', '', 'https://nwpc.dole.gov.ph/region-xii/'],
  ['MWE-2026-063', 'Region XII – SOCCSKSARGEN', 'Province', 'North Cotabato (except the 63 barangays now part of BARMM), Sarangani, South Cotabato, Sultan Kudarat', '', 'Non-Agriculture', 'PHP', '450', '2025-11-02', '460', '2026-12-15', '430', '', '', 'Wage Order No. XII-25', 'Active', '', 'https://nwpc.dole.gov.ph/region-xii/'],
  ['MWE-2026-064', 'Region XII – SOCCSKSARGEN', 'City', 'General santos, Kidapawan, Koronadal, Tacurong', '', 'Agriculture', 'PHP', '433', '2025-11-02', '443', '2026-12-15', '410', '', '', 'Wage Order No. XII-25', 'Active', '', 'https://nwpc.dole.gov.ph/region-xii/'],
  ['MWE-2026-065', 'Region XII – SOCCSKSARGEN', 'Province', 'North Cotabato (except the 63 barangays now part of BARMM), Sarangani, South Cotabato, Sultan Kudarat', '', 'Agriculture', 'PHP', '433', '2025-11-02', '443', '2026-12-15', '410', '', '', 'Wage Order No. XII-25', 'Active', '', 'https://nwpc.dole.gov.ph/region-xii/'],
  ['MWE-2026-066', 'Region XIII – Caraga', 'City', 'Bayugan, Bislig, Butuan, Cabadbaran, Surigao, Tandag', '', 'Non-Agriculture, Agriculture, Service/Retail and Manufacturing', 'PHP', '455', '2026-01-03', '475', '2026-05-01', '435', '', '', 'Wage Order No. RXIII-20', 'Active', '', 'https://nwpc.dole.gov.ph/region-xiii/'],
  ['MWE-2026-067', 'Region XIII – Caraga', 'Province', 'Agusan Del Norte, Agusan Del Sur, Dinagat Islands, Surigao Del Sur, Surigao Del Norte including Siargao Island', '', 'Non-Agriculture, Agriculture, Service/Retail and Manufacturing', 'PHP', '455', '2026-01-03', '475', '2026-05-01', '435', '', '', 'Wage Order No. RXIII-20', 'Active', '', 'https://nwpc.dole.gov.ph/region-xiii/'],
  ['MWE-2026-068', 'BARMM', 'City', 'Cotabato City', '', 'Non-Agriculture', 'PHP', '411', '2025-07-17', '', '', '361', '', '', 'Wage Order No. BARMM-04', 'Active', '', 'https://nwpc.dole.gov.ph/barmm/'],
  ['MWE-2026-069', 'BARMM', 'City', 'Cotabato City', '', 'Agriculture (Plantation and Non-Plantation); Retail', 'PHP', '386', '2025-07-17', '', '', '336', '', '', 'Wage Order No. BARMM-04', 'Active', '', 'https://nwpc.dole.gov.ph/barmm/'],
  ['MWE-2026-070', 'BARMM', 'Province', 'Maguindanao del Norte, Maguindanao del Sur, Lanao del Sur and Marawi, Basilan and Lamitan City, Sulu, Tawi-tawi', '', 'Non-Agriculture', 'PHP', '386', '2025-07-17', '', '', '336', '', '', 'Wage Order No. BARMM-04', 'Active', '', 'https://nwpc.dole.gov.ph/barmm/'],
  ['MWE-2026-071', 'BARMM', 'Province', 'Maguindanao del Norte, Maguindanao del Sur, Lanao del Sur and Marawi, Basilan and Lamitan City, Sulu, Tawi-tawi', '', 'Agriculture (Plantation and Non-Plantation); Retail', 'PHP', '376', '2025-07-17', '', '', '326', '', '', 'Wage Order No. BARMM-04', 'Active', '', 'https://nwpc.dole.gov.ph/barmm/'],
  ['MWE-2026-072', 'BARMM', 'Province', 'Special Geographical Area (SGA)', '', 'Non-Agriculture', 'PHP', '391', '2025-07-17', '', '', '341', '', '', 'Wage Order No. BARMM-04', 'Active', 'Locality type not given in Annex A', 'https://nwpc.dole.gov.ph/barmm/'],
  ['MWE-2026-073', 'BARMM', 'Province', 'Special Geographical Area (SGA)', '', 'Agriculture (Plantation and Non-Plantation); Retail', 'PHP', '366', '2025-07-17', '', '', '316', '', '', 'Wage Order No. BARMM-04', 'Active', 'Locality type not given in Annex A', 'https://nwpc.dole.gov.ph/barmm/'],
]);

const unique = values => [...new Set(values.filter(Boolean))];
const column = key => MWE_RATE_ROWS.map(row => row[MWE_COLUMNS.indexOf(key)]);

export const MWE_REGIONS = Object.freeze(unique(column('region')));
/** Annex A: a reference table that may be None or blank. */
export const MWE_CLASSIFICATIONS = Object.freeze(unique(column('classification')));
export const MWE_SECTORS = Object.freeze(unique(column('sector')).sort());

/** A Locality Name cell lists several places; each is its own choice on Basic Pay. */
export function splitLocalityNames(text = '') {
  const names = [];
  let depth = 0; let current = '';
  for (const character of String(text)) {
    if (character === '(') depth += 1;
    if (character === ')') depth = Math.max(0, depth - 1);
    if (character === ',' && depth === 0) { names.push(current); current = ''; } else current += character;
  }
  names.push(current);
  return names.map(name => name.trim()).filter(Boolean);
}

/** Annex A: Classification is a reference value that may be None or blank; both mean the region does not classify the place. */
export const MWE_NO_CLASSIFICATION = 'None';
const classificationOf = value => (!value || value === MWE_NO_CLASSIFICATION ? '' : value);

/** Columns of the MWE Locality reference table (Reference Tables › Generic), as in Annex A D2. */
export const MWE_LOCALITY_COLUMNS = Object.freeze([
  ['code', 'MWE Locality Code'], ['region', 'Region'], ['locality', 'Locality (City, Municipality, Province)'],
  ['localityName', 'Locality Name'], ['classification', 'Classification'], ['status', 'Status'],
]);

/**
 * The MWE Locality reference table's seed: every Region, Locality, Locality
 * Name and Classification in Annex A D2, one place a row. A D2 cell that
 * lists several names gives one row for each; a blank Classification is None.
 */
export const MWE_LOCALITY_ROWS = Object.freeze((() => {
  const seen = new Set();
  const places = [];
  MWE_RATE_ROWS.forEach(row => {
    const [region, locality, names, classification] = ['region', 'locality', 'localityName', 'classification'].map(key => row[MWE_COLUMNS.indexOf(key)]);
    splitLocalityNames(names).forEach(localityName => {
      const place = { region, locality, localityName, classification: classification || MWE_NO_CLASSIFICATION };
      const key = Object.values(place).join('|');
      if (!seen.has(key)) { seen.add(key); places.push(place); }
    });
  });
  return places.map((place, index) => Object.freeze({ id: `mwe-locality-${index + 1}`, code: `MWEL-${String(index + 1).padStart(3, '0')}`, ...place, status: 'Active' }));
})());

const LOCALITY_KEYS = Object.freeze({ mweRegion: 'region', mweLocality: 'locality', mweLocalityName: 'localityName', mweClassification: 'classification' });

/**
 * The Basic Pay choices for Region, Locality, Locality Name and Classification,
 * read from the MWE Locality reference table and narrowed by the choices above.
 */
export function mweLocalityChoices(places, field, place = {}) {
  const fields = Object.keys(LOCALITY_KEYS);
  const above = fields.slice(0, fields.indexOf(field));
  const candidates = places.filter(row => (row.status || 'Active') === 'Active' && above.every(key => !place[key] || (key === 'mweClassification' ? classificationOf(row.classification) === classificationOf(place[key]) : row[LOCALITY_KEYS[key]] === place[key])));
  const values = unique(candidates.map(row => (field === 'mweClassification' ? row.classification || MWE_NO_CLASSIFICATION : row[LOCALITY_KEYS[field]])));
  return field === 'mweLocality' ? MWE_LOCALITIES.filter(locality => values.includes(locality)) : values;
}

/** Classification is asked only where the region classifies its places. */
export const mweRegionHasClassification = (places, region) => Boolean(region) && mweLocalityChoices(places, 'mweClassification', { mweRegion: region }).some(value => value !== MWE_NO_CLASSIFICATION);

/** New Rate is the 1st tranche; Increase Rate is New less Old. Both are computed, never typed. */
export function withComputedMweRates(row) {
  const newRate = Number(row.dailyRate || 0);
  const oldRate = Number(row.oldRate || 0);
  return { ...row, currency: row.currency || 'PHP', newRate: newRate ? String(newRate) : '', increaseRate: newRate && oldRate ? String(Math.round((newRate - oldRate) * 100) / 100) : '' };
}

/** The place fields on a Basic Pay entry, in Annex A order. */
export const MWE_PLACE_FIELDS = Object.freeze(['mweRegion', 'mweLocality', 'mweLocalityName', 'mweClassification', 'mweSector']);
const MATCH_FIELDS = MWE_PLACE_FIELDS;

const matchesPlace = (row, place, upTo) => {
  const checks = {
    mweRegion: () => row.region === place.mweRegion,
    mweLocality: () => row.locality === place.mweLocality,
    mweLocalityName: () => splitLocalityNames(row.localityName).includes(place.mweLocalityName),
    mweClassification: () => classificationOf(row.classification) === classificationOf(place.mweClassification),
    mweSector: () => row.sector === place.mweSector,
  };
  return MATCH_FIELDS.slice(0, upTo).every(key => !place[key] || checks[key]());
};

/**
 * The choices for one place field, narrowed by everything chosen above it, so
 * Basic Pay can only describe a place that has a rate on file.
 */
export function mweChoices(rows, field, place = {}) {
  const position = MATCH_FIELDS.indexOf(field);
  const candidates = rows.filter(row => row.status === 'Active' && matchesPlace(row, place, position));
  if (field === 'mweRegion') return unique(candidates.map(row => row.region));
  if (field === 'mweLocality') return MWE_LOCALITIES.filter(locality => candidates.some(row => row.locality === locality));
  if (field === 'mweLocalityName') return unique(candidates.flatMap(row => splitLocalityNames(row.localityName)));
  if (field === 'mweClassification') return unique(candidates.map(row => row.classification));
  return unique(candidates.map(row => row.sector));
}

const day = value => {
  const text = String(value || '');
  const parts = text.split('/');
  const time = Date.parse(parts.length === 3 ? `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}` : text);
  return Number.isNaN(time) ? 0 : time;
};

const rateInForce = (row, when) => {
  if (row.effectiveDate2 && Number(row.dailyRate2) > 0 && when >= day(row.effectiveDate2)) return { row, dailyRate: Number(row.dailyRate2), tranche: '2nd tranche', effectiveDate: row.effectiveDate2 };
  if (when >= day(row.effectiveDate)) return { row, dailyRate: Number(row.dailyRate), tranche: '1st tranche', effectiveDate: row.effectiveDate };
  return Number(row.oldRate) > 0 ? { row, dailyRate: Number(row.oldRate), tranche: 'rate before this wage order', effectiveDate: '' } : null;
};

/**
 * The minimum wage in force for a place on a date. A wage order's 2nd tranche
 * replaces the 1st from its own effective date; before the 1st tranche the
 * Old Rate still applies. With a Sector the rate is that sector's; without
 * one it is the lowest sector rate for the place, so a daily rate is only
 * flagged when it is below every one of them.
 */
export function mweRateOn(rows, place, date) {
  if (!place?.mweRegion || !place.mweLocalityName) return null;
  const when = day(date) || Date.now();
  // Without a Classification only an unclassified rate fits: where the rate
  // depends on it (CALABARZON, Central Visayas, Northern Mindanao) guessing one
  // would compare the employee against another place's minimum wage.
  const matching = rows.filter(item => item.status === 'Active' && matchesPlace(item, place, MATCH_FIELDS.length)
    && classificationOf(item.classification) === classificationOf(place.mweClassification));
  const latestBySector = new Map();
  matching.forEach(item => {
    const held = latestBySector.get(item.sector);
    if (!held || day(item.effectiveDate) > day(held.effectiveDate)) latestBySector.set(item.sector, item);
  });
  return [...latestBySector.values()].map(item => rateInForce(item, when)).filter(Boolean).sort((a, b) => a.dailyRate - b.dailyRate)[0] || null;
}

/**
 * A Basic Pay entry saved with the earlier single Location keeps its place: a
 * region name becomes the Region, a place named in a rate row fills in the rest.
 */
export function withMwePlace(entry, rows) {
  if (!entry?.location || MWE_PLACE_FIELDS.some(key => entry[key])) return entry;
  const { location, ...rest } = entry;
  if (rows.some(row => row.region === location)) return { ...rest, mweRegion: location };
  const row = rows.find(item => splitLocalityNames(item.localityName).includes(location));
  return row ? { ...rest, mweRegion: row.region, mweLocality: row.locality, mweLocalityName: location } : rest;
}

export const mwePlaceName = place => [place.mweLocalityName, place.mweRegion].filter(Boolean).join(', ');
