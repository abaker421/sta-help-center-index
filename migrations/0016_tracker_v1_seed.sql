-- DRAFT - migrations/0016_tracker_v1_seed.sql
-- Launch seed for the Projects tab v1. GENERATED from
-- projects-tab-redesign-mockup.html v4 (2026-08-12) - the seed source named in
-- Adam-Work-Brain/Inbox/2026-08-12-tracker-cutover-and-update-ritual.md.
-- 27 real STA work items. No sample rows, no placeholders.
--
-- Idempotent: keyed on the stable slug / key columns, so re-running is safe.
-- Ages are seeded from the dates the item records actually state; where a
-- record states no date, the column is NULL rather than back-filled.

PRAGMA foreign_keys = ON;

-- Sections -------------------------------------------------------------
INSERT OR REPLACE INTO tr_sections (id,key,name,kind,blurb,sort) VALUES (1,'schooltrak','SchoolTRAK','product','Positive Attendance module lives here',10);
INSERT OR REPLACE INTO tr_sections (id,key,name,kind,blurb,sort) VALUES (2,'virtuatime','VirtuaTime','product','Employee time tracking (Qmlativ)',20);
INSERT OR REPLACE INTO tr_sections (id,key,name,kind,blurb,sort) VALUES (3,'timeclocks','Time Clocks','product','TT7 / TT10 / TT3 + CMI / Blue Sky apps',30);
INSERT OR REPLACE INTO tr_sections (id,key,name,kind,blurb,sort) VALUES (4,'idbadging','ID Badging','product','Student / staff badge printing + hosted ID',40);
INSERT OR REPLACE INTO tr_sections (id,key,name,kind,blurb,sort) VALUES (5,'cross','Cross-Product Threads','cross','one item, one home section, tagged with every product it also affects',50);
INSERT OR REPLACE INTO tr_sections (id,key,name,kind,blurb,sort) VALUES (6,'standalone','Standalone Projects','standalone','self-contained, not part of a product line',60);
INSERT OR REPLACE INTO tr_sections (id,key,name,kind,blurb,sort) VALUES (7,'ops','Operations / Internal','ops','org & process work - splits by department later',70);

-- People (native assignee picklist; expandable) -------------------------
-- Emails confirmed 2026-08-12 from the all-hands thread on adamb@k12sta.com.
-- They make an "assigned to me" default possible: the Access JWT email matches
-- tr_people.email directly.
INSERT OR REPLACE INTO tr_people (id,key,name,email,active,sort) VALUES (1,'adam','Adam','adamb@k12sta.com',1,10);
INSERT OR REPLACE INTO tr_people (id,key,name,email,active,sort) VALUES (2,'chris','Chris','chrisb@k12sta.com',1,20);
INSERT OR REPLACE INTO tr_people (id,key,name,email,active,sort) VALUES (3,'tyler','Tyler','tylerb@k12sta.com',1,30);
INSERT OR REPLACE INTO tr_people (id,key,name,email,active,sort) VALUES (4,'pat','Pat','patm@k12sta.com',1,40);
INSERT OR REPLACE INTO tr_people (id,key,name,email,active,sort) VALUES (5,'dan','Dan','danh@k12sta.com',1,50);
INSERT OR REPLACE INTO tr_people (id,key,name,email,active,sort) VALUES (6,'andy','Andy','andrewh@k12sta.com',1,60);
INSERT OR REPLACE INTO tr_people (id,key,name,email,active,sort) VALUES (7,'tanya','Tanya','tanyab@k12sta.com',1,70);

-- Vendors ---------------------------------------------------------------
INSERT OR REPLACE INTO tr_vendors (id,name,sort) VALUES (1,'Crux',10);
INSERT OR REPLACE INTO tr_vendors (id,name,sort) VALUES (2,'CMI',20);
INSERT OR REPLACE INTO tr_vendors (id,name,sort) VALUES (3,'Skyward',30);
INSERT OR REPLACE INTO tr_vendors (id,name,sort) VALUES (4,'Ban-Koe',40);

-- Items -----------------------------------------------------------------
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (1,'st-reunif',1,NULL,'newproduct','Reunification module — 5 accountability states, EduPoint competitive analysis; SOW drafted','prog','2026-07-10',NULL,6,NULL,NULL,NULL,NULL,'Skyward contract language (on hold until resolved)','2026-07-24',NULL,NULL,10);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (2,'st-pa',1,'Positive Attendance','feature','Positive Attendance viability / turnaround — make SchoolTRAK PA sellable again','prog',NULL,NULL,6,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,20);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (3,'st-11test',1,NULL,'feature','SchoolTRAK 1.1 release test & rollout','prog',NULL,NULL,2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,30);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (4,'st-locations',1,NULL,'bug','Locations tab hard-coded to Skyward student schedule — can’t add a customer-requested field','prog',NULL,NULL,2,NULL,NULL,NULL,NULL,'Skyward must add a dedicated field','2026-06-19',NULL,NULL,40);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (5,'st-teacherview',1,NULL,'feature','Teacher view','prog',NULL,NULL,4,'2026-07-27',NULL,NULL,NULL,NULL,NULL,NULL,NULL,50);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (6,'fr-hallpass',1,NULL,'request','Hall pass feature','open',NULL,'onhold',6,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,60);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (7,'vt-license',2,NULL,'bug','License number issue — no resolution or timeline; Adam looking into options','open',NULL,NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,70);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (8,'vt-portal-ux',2,NULL,'feature','Self-service portal UX updates','prog',NULL,NULL,3,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,80);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (9,'vt-mdm',2,NULL,'feature','MDM docs being updated','prog',NULL,NULL,3,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,90);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (10,'vt-tcuser',2,NULL,'bug','Set up a time-clock user in Skyward (needed for the new sandbox)','prog',NULL,NULL,1,NULL,'vendor','2026-07-24','Cody (Skyward)',NULL,NULL,NULL,NULL,100);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (11,'vt-licensingsow',2,NULL,'feature','SOW to update the VirtuaTime licensing portal — sent today (CC Igor & Vlad)','prog','2026-07-24',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,110);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (12,'vt-graybtn',2,NULL,'decision','Gray-button concern — hold until a real customer complaint before changing','done','2026-06-12',NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,120);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (13,'fr-timeoff',2,NULL,'request','Time-off requests in VirtuaTime','open',NULL,'onhold',3,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,130);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (14,'fr-badge',2,NULL,'request','Badge support in VirtuaTime','open',NULL,'archived',3,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,140);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (15,'tc-bluesky',3,NULL,'bug','Blue Sky app incompatible with Windows 2021; 4 clocks returned non-functional','prog',NULL,NULL,5,NULL,NULL,NULL,NULL,'CMI info / Windows 2021 compatibility','2026-07-10',NULL,NULL,150);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (16,'tc-chips',3,NULL,'decision','Blue Sky → CMI white-app switch — get chip count from CMI to know when clocks must switch; then update RMA docs (returned clocks come back with the different app)','prog',NULL,NULL,5,NULL,'vendor','2026-07-24','chip count from CMI',NULL,NULL,NULL,NULL,160);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (17,'id-badgebug',4,NULL,'bug','Badge images not displaying on v6.5.5 — affects all customers on 6.5.5 (Portage hit it first); needs a permanent fix','prog',NULL,NULL,2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,170);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (18,'id-hostedid',4,NULL,'newproduct','Hosted / cloud ID solution — ongoing (Ban-Koe/Vidix; Crux is the fallback builder)','open',NULL,NULL,6,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,180);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (19,'id-nda',4,NULL,'decision','Ban-Koe NDA before Thursday’s hosted-ID demo; revenue-split review underway','prog',NULL,NULL,6,'2026-07-30',NULL,NULL,NULL,NULL,NULL,NULL,NULL,190);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (20,'x-sandbox',5,NULL,'bug','VirtuaTime sandbox — full teardown/rebuild','done',NULL,NULL,5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,200);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (21,'x-gftd',5,NULL,'feature','“Gone for the Day” — coordinated rollout','done',NULL,NULL,3,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,210);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (22,'x-tempout',5,NULL,'bug','“Temporarily Out” feature — Skyward’s rollout not working on clocks (likely not on VirtuaTime either)','prog',NULL,NULL,1,NULL,'vendor','2026-07-24','Skyward testing on a time clock first',NULL,NULL,NULL,NULL,220);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (23,'sa-vidix',6,NULL,'decision','Vidix Control (hosted ID) — Brian to demo by end of July; if not delivered by mid-August, Crux builds it instead','prog',NULL,NULL,1,'2026-08-15','vendor','2026-07-10','Brian (Ban-Koe) to deliver',NULL,NULL,NULL,NULL,230);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (24,'op-vlad',7,NULL,'bug','Vlad added to the repositories','done','2026-07-21',NULL,2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,240);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (25,'op-flex',7,NULL,'bug','Flex scheduling stuck in “testing” with Rick & Mel ~1.5 years — not scheduled for testing anytime soon','open',NULL,NULL,1,NULL,'schooltech','2026-07-21','Rick & Mel — not scheduled for testing',NULL,NULL,NULL,NULL,250);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (26,'op-hcaccess',7,NULL,'bug','Locked out of the Skyward Help Center — Skyward changed our database','prog',NULL,NULL,2,NULL,'vendor','2026-07-24','Skyward ticket + Cody',NULL,NULL,NULL,NULL,260);
INSERT OR REPLACE INTO tr_items (id,slug,section_id,module,type,title,status,status_changed_at,req_state,assignee_id,target_date,waiting_who,waiting_since,waiting_note,blocked_on,blocked_since,stage,department,sort) VALUES (27,'op-apichecklist',7,NULL,'feature','Get STA products added to the Skyward API integration list (links, contacts, checklist) — other vendors have this, we don’t','prog',NULL,NULL,1,NULL,NULL,NULL,NULL,'can’t access the Skyward Help Center (locked out)','2026-07-24',NULL,NULL,270);

-- Also-affects tags (cross-product items keep ONE home section, D2) -----
INSERT OR REPLACE INTO tr_item_products (item_id,section_id) VALUES (20,2);
INSERT OR REPLACE INTO tr_item_products (item_id,section_id) VALUES (20,3);
INSERT OR REPLACE INTO tr_item_products (item_id,section_id) VALUES (20,4);
INSERT OR REPLACE INTO tr_item_products (item_id,section_id) VALUES (20,1);
INSERT OR REPLACE INTO tr_item_products (item_id,section_id) VALUES (21,2);
INSERT OR REPLACE INTO tr_item_products (item_id,section_id) VALUES (21,3);
INSERT OR REPLACE INTO tr_item_products (item_id,section_id) VALUES (22,3);
INSERT OR REPLACE INTO tr_item_products (item_id,section_id) VALUES (22,2);

-- Vendor tags -----------------------------------------------------------
INSERT OR REPLACE INTO tr_item_vendors (item_id,vendor_id) VALUES (1,1);
INSERT OR REPLACE INTO tr_item_vendors (item_id,vendor_id) VALUES (1,3);
INSERT OR REPLACE INTO tr_item_vendors (item_id,vendor_id) VALUES (2,3);
INSERT OR REPLACE INTO tr_item_vendors (item_id,vendor_id) VALUES (3,1);
INSERT OR REPLACE INTO tr_item_vendors (item_id,vendor_id) VALUES (4,3);
INSERT OR REPLACE INTO tr_item_vendors (item_id,vendor_id) VALUES (6,3);
INSERT OR REPLACE INTO tr_item_vendors (item_id,vendor_id) VALUES (10,3);
INSERT OR REPLACE INTO tr_item_vendors (item_id,vendor_id) VALUES (11,1);
INSERT OR REPLACE INTO tr_item_vendors (item_id,vendor_id) VALUES (12,3);
INSERT OR REPLACE INTO tr_item_vendors (item_id,vendor_id) VALUES (15,2);
INSERT OR REPLACE INTO tr_item_vendors (item_id,vendor_id) VALUES (16,2);
INSERT OR REPLACE INTO tr_item_vendors (item_id,vendor_id) VALUES (17,4);
INSERT OR REPLACE INTO tr_item_vendors (item_id,vendor_id) VALUES (18,4);
INSERT OR REPLACE INTO tr_item_vendors (item_id,vendor_id) VALUES (18,1);
INSERT OR REPLACE INTO tr_item_vendors (item_id,vendor_id) VALUES (19,4);
INSERT OR REPLACE INTO tr_item_vendors (item_id,vendor_id) VALUES (20,3);
INSERT OR REPLACE INTO tr_item_vendors (item_id,vendor_id) VALUES (20,1);
INSERT OR REPLACE INTO tr_item_vendors (item_id,vendor_id) VALUES (22,3);
INSERT OR REPLACE INTO tr_item_vendors (item_id,vendor_id) VALUES (23,4);
INSERT OR REPLACE INTO tr_item_vendors (item_id,vendor_id) VALUES (23,1);
INSERT OR REPLACE INTO tr_item_vendors (item_id,vendor_id) VALUES (26,3);
INSERT OR REPLACE INTO tr_item_vendors (item_id,vendor_id) VALUES (27,3);

-- Sub-item checklists (one level only) -----------------------------------
INSERT INTO tr_subitems (item_id,text,done,sort) SELECT 3,'Period Rules page redesign',1,10 WHERE NOT EXISTS (SELECT 1 FROM tr_subitems WHERE item_id=3 AND text='Period Rules page redesign');
INSERT INTO tr_subitems (item_id,text,done,sort) SELECT 3,'MailChimp testing',0,20 WHERE NOT EXISTS (SELECT 1 FROM tr_subitems WHERE item_id=3 AND text='MailChimp testing');
INSERT INTO tr_subitems (item_id,text,done,sort) SELECT 3,'Quality-of-life SOW — test',0,30 WHERE NOT EXISTS (SELECT 1 FROM tr_subitems WHERE item_id=3 AND text='Quality-of-life SOW — test');
INSERT INTO tr_subitems (item_id,text,done,sort) SELECT 3,'Clarify what''s in the 1.1 release build (Vlad)',0,40 WHERE NOT EXISTS (SELECT 1 FROM tr_subitems WHERE item_id=3 AND text='Clarify what''s in the 1.1 release build (Vlad)');
INSERT INTO tr_subitems (item_id,text,done,sort) SELECT 3,'Clarify what''s in the test build NOT going to release (Vlad)',0,50 WHERE NOT EXISTS (SELECT 1 FROM tr_subitems WHERE item_id=3 AND text='Clarify what''s in the test build NOT going to release (Vlad)');
INSERT INTO tr_subitems (item_id,text,done,sort) SELECT 3,'Update all help articles',0,60 WHERE NOT EXISTS (SELECT 1 FROM tr_subitems WHERE item_id=3 AND text='Update all help articles');
INSERT INTO tr_subitems (item_id,text,done,sort) SELECT 3,'Take screenshots',0,70 WHERE NOT EXISTS (SELECT 1 FROM tr_subitems WHERE item_id=3 AND text='Take screenshots');
INSERT INTO tr_subitems (item_id,text,done,sort) SELECT 3,'Send customer release-note email',0,80 WHERE NOT EXISTS (SELECT 1 FROM tr_subitems WHERE item_id=3 AND text='Send customer release-note email');
INSERT INTO tr_subitems (item_id,text,done,sort) SELECT 5,'Barber''s Hill ISD teacher-view demo — Mon AM (Chris demoing; Rachel on newsletter Qs)',0,10 WHERE NOT EXISTS (SELECT 1 FROM tr_subitems WHERE item_id=5 AND text='Barber''s Hill ISD teacher-view demo — Mon AM (Chris demoing; Rachel on newsletter Qs)');

-- Dependency links -------------------------------------------------------
INSERT OR REPLACE INTO tr_dependencies (item_id,depends_on_id,qualifier) VALUES (1,2,'Full only');
INSERT OR REPLACE INTO tr_dependencies (item_id,depends_on_id,qualifier) VALUES (18,23,NULL);
INSERT OR REPLACE INTO tr_dependencies (item_id,depends_on_id,qualifier) VALUES (27,26,NULL);

-- Per-item history (append-only) -----------------------------------------
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 1,'Jul 10','2026-07-10','introduced as major initiative',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=1 AND note='introduced as major initiative');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 1,'Jul 24','2026-07-24','SOW drafted; on hold pending Skyward contract',20 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=1 AND note='SOW drafted; on hold pending Skyward contract');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 1,'',NULL,'Full reunification depends on Positive Attendance; Light reunification does not',30 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=1 AND note='Full reunification depends on Positive Attendance; Light reunification does not');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 2,'',NULL,'Initiative: diagnose why PA is failing (STA UX/docs/sales, customer migration confusion, Skyward PA gaps + buck-passing) and build a turnaround plan — full report in _Research-Commissions/schooltrak-positive-attendance-viability',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=2 AND note='Initiative: diagnose why PA is failing (STA UX/docs/sales, customer migration confusion, Skyward PA gaps + buck-passing) and build a turnaround plan — full report in _Research-Commissions/schooltrak-positive-attendance-viability');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 2,'Jul 24','2026-07-24','met with Brett (Skyward) to go over PA; captured next steps',20 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=2 AND note='met with Brett (Skyward) to go over PA; captured next steps');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 2,'',NULL,'No “light PA” — light applies to Reunification, not Positive Attendance',30 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=2 AND note='No “light PA” — light applies to Reunification, not Positive Attendance');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 3,'Jul',NULL,'1.1 contents PENDING: Vlad gave conflicting answers on what''s in 1.1 vs 1.0.6.1; changelog not yet captured',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=3 AND note='1.1 contents PENDING: Vlad gave conflicting answers on what''s in 1.1 vs 1.0.6.1; changelog not yet captured');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 4,'Jun 19','2026-06-19','Skyward would need to add a dedicated field',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=4 AND note='Skyward would need to add a dedicated field');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 5,'Jul 24','2026-07-24','Barber''s Hill demo scheduled Monday AM',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=5 AND note='Barber''s Hill demo scheduled Monday AM');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 6,'',NULL,'Not doing until Skyward confirms we''re allowed to sell it',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=6 AND note='Not doing until Skyward confirms we''re allowed to sell it');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 6,'Jul 24','2026-07-24','Skyward can’t mandate exclusivity outright; contract language being crafted for similar effect',20 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=6 AND note='Skyward can’t mandate exclusivity outright; contract language being crafted for similar effect');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 10,'Jul 24','2026-07-24','waiting on Cody (Skyward)',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=10 AND note='waiting on Cody (Skyward)');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 11,'Jul 24','2026-07-24','SOW sent; Vlad + Igor CC’d',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=11 AND note='SOW sent; Vlad + Igor CC’d');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 12,'Jun 12','2026-06-12','decided: hold until a real complaint',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=12 AND note='decided: hold until a real complaint');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 13,'Jul 10','2026-07-10','by-design gap, not a bug',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=13 AND note='by-design gap, not a bug');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 14,'Jul 10','2026-07-10','by-design; archived',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=14 AND note='by-design; archived');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 15,'Jul 10','2026-07-10','RMA templates on hold pending CMI info; Dan to call Ken',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=15 AND note='RMA templates on hold pending CMI info; Dan to call Ken');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 16,'',NULL,'Need chip count from CMI to know the RMA runway',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=16 AND note='Need chip count from CMI to know the RMA runway');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 16,'',NULL,'Once switch timing is known, update docs: clocks sent for RMA return with the new app + different look',20 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=16 AND note='Once switch timing is known, update docs: clocks sent for RMA return with the new app + different look');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 17,'',NULL,'Photos only show if the file extension is manually set to jpg under “custom”',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=17 AND note='Photos only show if the file extension is manually set to jpg under “custom”');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 17,'',NULL,'Chris sent a temp fix; permanent fix needed — Andrew to raise with Ban-Koe',20 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=17 AND note='Chris sent a temp fix; permanent fix needed — Andrew to raise with Ban-Koe');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 18,'',NULL,'Ongoing hosted-ID initiative — Vidix product made by Ban-Koe',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=18 AND note='Ongoing hosted-ID initiative — Vidix product made by Ban-Koe');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 18,'',NULL,'If the Ban-Koe/Vidix deal doesn’t land, Crux builds it as the fallback',20 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=18 AND note='If the Ban-Koe/Vidix deal doesn’t land, Crux builds it as the fallback');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 18,'Jul 24','2026-07-24','no commitment until after the Thursday demo',30 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=18 AND note='no commitment until after the Thursday demo');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 19,'Jul 24','2026-07-24','NDA must be signed before the Thu demo; no paperwork/commitment until after',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=19 AND note='NDA must be signed before the Thu demo; no paperwork/commitment until after');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 20,'Jun 19','2026-06-19','teardown/rebuild called for',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=20 AND note='teardown/rebuild called for');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 20,'Jul',NULL,'FIXED',20 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=20 AND note='FIXED');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 21,'May 29','2026-05-29','testing',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=21 AND note='testing');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 21,'Jul',NULL,'FIXED / shipped',20 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=21 AND note='FIXED / shipped');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 22,'',NULL,'Skyward is testing it on a time clock first; once they do, we test VirtuaTime, then they roll out',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=22 AND note='Skyward is testing it on a time clock first; once they do, we test VirtuaTime, then they roll out');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 22,'',NULL,'Our end works — the issue is Skyward’s pushed update won’t work until they fix it',20 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=22 AND note='Our end works — the issue is Skyward’s pushed update won’t work until they fix it');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 23,'May 29','2026-05-29','Ban-Koe cloud option surfaced',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=23 AND note='Ban-Koe cloud option surfaced');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 23,'Jul 10','2026-07-10','demo completed, solid product; mid-Aug forcing function set',20 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=23 AND note='demo completed, solid product; mid-Aug forcing function set');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 24,'Jul 21','2026-07-21','raised with Andy',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=24 AND note='raised with Andy');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 24,'Jul',NULL,'DONE, Vlad has repo access',20 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=24 AND note='DONE, Vlad has repo access');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 25,'Jul 21','2026-07-21','flagged to Andy as a stalled infrastructure item',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=25 AND note='flagged to Andy as a stalled infrastructure item');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 26,'Jul 24','2026-07-24','Chris to open a ticket + reach out to Cody',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=26 AND note='Chris to open a ticket + reach out to Cody');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 27,'',NULL,'Ticket open with Skyward',10 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=27 AND note='Ticket open with Skyward');
INSERT INTO tr_history (item_id,when_label,occurred_on,note,sort) SELECT 27,'',NULL,'Blocked: can’t see the current list until Help Center access is restored',20 WHERE NOT EXISTS (SELECT 1 FROM tr_history WHERE item_id=27 AND note='Blocked: can’t see the current list until Help Center access is restored');
