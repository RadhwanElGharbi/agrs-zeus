<!-- a5a94269-0c73-477d-923f-c6ea42466596 68a574bd-9c56-4a7b-99e1-63545121ba35 -->
# 2M Timestep Production Training - Corrected Coastline Logic

## Objective

Run full 2M timestep production training with the corrected coastline constraint to validate final behavior:
- Coastline crossing (<10m): Immediate termination (hard boundary)
- Coastal waters (<200m from coast): Blocked
- Inland rivers (>200m from coast): Allowed with crossing cost
- Expected result: 2-5% water coverage from necessary river crossings, no offshore routing

## Pre-Training Verification

### 1. Confirm Coastline Status
- Coastline file exists: `data/vectors/processed/coastline_epsg32633_processed.gpkg` (136KB, 37 segments)
- Loading confirmed: "Coastline boundary loaded (37 segments)" in test
- Logic fixed: Blocks <200m from coast, allows >200m (rivers)
- Build status: C++ compiled with corrected `is_beyond_coastline()` logic

### 2. Configuration Verification
- Config file: `PIRL/pirl_training_config_production.yaml`
- Total timesteps: 2,000,000
- Parallel environments: 8
- Max steps per episode: 5000
- Eval/save frequency: Every 50,000 timesteps
- Device: CPU (line 159 in training script)

## Training Execution

### 1. Clear Previous State
Remove any remaining checkpoints from the incorrect logic training:
```bash
rm -f PIRL/models/checkpoints/pirl_model_*_steps.zip
```

### 2. Start Training
Execute in background with logging:
```bash
cd /opt/agrs/Projects/test_project2
source /opt/agrs/python/pirl_venv/bin/activate
nohup python /opt/agrs/Projects/test_project/train_pirl_direct.py \
  --config PIRL/pirl_training_config_production.yaml \
  > PIRL/training_2M_corrected.log 2>&1 &
```

### 3. Expected Timeline
- Duration: ~13-16 hours (CPU training)
- Checkpoints: Every 50k timesteps (40 total checkpoints)
- Milestones:
  - 500k (~3-4 hours): 25% complete
  - 1M (~7-8 hours): 50% complete
  - 1.5M (~10-12 hours): 75% complete
  - 2M (~13-16 hours): 100% complete

## Post-Training Validation

### 1. Generate Route from Final Model
```bash
python generate_route_from_model.py \
  --model PIRL/models/best_model/best_model.zip \
  --config PIRL/pirl_training_config_production.yaml \
  --vec-normalize PIRL/models/pirl_italy_production_2M_vecnormalize.pkl \
  --output PIRL/outputs/route_2M_corrected.geojson \
  --deterministic
```

### 2. Analyze Route Compliance
Run comprehensive validation:
```bash
python validate_production_route.py PIRL/outputs/route_2M_corrected.geojson
```

### 3. Success Criteria
Expected results with corrected logic:
- Water coverage: 2-5% (inland river crossings only)
- Route completion: 100% (reaches goal)
- Coastline violations: 0 (hard boundary prevents crossing)
- Route length: 62-68 km
- Max slope: <20% (agent can navigate with river option available)
- No coastal water segments (<200m from coastline)

### 4. Comparison Analysis
Compare against previous runs:
- Old model (no coastline): 58.6% water, 71km, offshore through Adriatic
- Wrong logic (1.3M): 0.0% water, 8.1km, blocked all rivers
- Corrected logic (2M): Expected 2-5% water, 62-68km, rivers only

## Monitoring Commands

**Real-time progress:**
```bash
tail -f /opt/agrs/Projects/test_project2/PIRL/training_2M_corrected.log
```

**Check timestep count:**
```bash
grep "total_timesteps" PIRL/training_2M_corrected.log | tail -1
```

**Verify still running:**
```bash
ps aux | grep train_pirl_direct | grep -v grep
```

**TensorBoard:**
```bash
tensorboard --logdir PIRL/outputs/production_2M/tensorboard
```

## Expected Outcomes

### Training Convergence
Based on previous 2M run patterns:
- Early phase (0-500k): Random exploration, high failure rate
- Mid phase (500k-1.5M): Policy improvement, increasing success rate
- Late phase (1.5M-2M): Convergence to consistent strategy (~52-step routes observed before)

### Route Characteristics
With corrected coastline logic:
- Agent will learn coastal waters are impassable
- Agent will learn inland rivers are crossable (with cost)
- Final routes will include 2-4 river crossings when cost-effective
- No offshore segments in Adriatic Sea
- Complete 62km route staying primarily on land

### Key Difference from 50k Test
The 50k test was inconclusive because:
- Agent only traveled 11.3km before hitting terrain limit
- Never reached coastal area to test constraint
- 50k insufficient for complex navigation learning
- 2M timesteps will allow full route exploration and convergence

## Risk Mitigation

**If training fails or hangs:**
- Check logs for errors: `tail -100 PIRL/training_2M_corrected.log`
- Verify process running: `ps aux | grep train_pirl`
- Check disk space: `df -h`
- Check memory: `free -h`

**If coastline not loading during training:**
- Verify in early log messages (first 100 lines)
- Should see "Coastline boundary loaded (37 segments)"
- If missing, coastline constraint not active

**If route still shows 0% water after 2M:**
- Check if agent reached coastal areas (route length >50km)
- Verify coastline constraint messages in logs
- May need to investigate Python wrapper initialization

## Deliverables

After successful completion:
1. Trained model: `PIRL/models/best_model/best_model.zip`
2. Checkpoints: `PIRL/models/checkpoints/pirl_model_*_steps.zip` (40 files)
3. Normalization stats: `PIRL/models/pirl_italy_production_2M_vecnormalize.pkl`
4. Route GeoJSON: `PIRL/outputs/route_2M_corrected.geojson`
5. Validation report: From `validate_production_route.py`
6. Training log: `PIRL/training_2M_corrected.log`

## Success Definition

Training is successful if final route demonstrates:
- Inland river crossings permitted (2-5% water coverage)
- Coastal boundary respected (no offshore routing)
- Complete route to goal (distance to goal <100m)
- Compliant with all other constraints (slope, crossings, etc.)

This validates that the corrected coastline logic properly differentiates between coastal waters (blocked) and inland rivers (crossable).


### To-dos

- [ ] Create PipelineSpecifications module with JSON loading and validation methods
- [ ] Integrate PipelineSpecifications into ProjectConfig and PhysicsConstraints
- [ ] Implement hard constraint enforcement (bend angles, clearances) with episode termination
- [ ] Create Hydraulics module with Darcy-Weisbach, Reynolds number, and friction factor calculations
- [ ] Implement pumping station placement logic based on pressure drop limits
- [ ] Expand State struct from 17 to 21 dimensions with hydraulic features
- [ ] Integrate hydraulic calculations into PipelineEnvironment::step() method
- [ ] Add pumping station costs and flow optimization penalties to CostModel
- [ ] Create RegulatoryCompliance module with violation detection and cost calculation
- [ ] Define regulatory thresholds based on Italian regulations (NTC 2018, Natura 2000, etc.)
- [ ] Integrate regulatory cost penalties into CostModel::calculate_segment_cost()
- [ ] Update Python wrapper (pirl_native_env.py) for 21-dimensional state space
- [ ] Update training config YAML with hydraulics and regulatory sections
- [ ] Rebalance cost weights in ProjectConfig to include hydraulic and regulatory factors
- [ ] Create unit tests for hydraulics, pipeline specs, and regulatory modules
- [ ] Create comprehensive integration test for enhanced PIRL system
- [ ] Create Python validation script to verify enhanced model correctness
- [ ] Update technical documentation with hydraulics, specs, and regulatory features
- [ ] Create comprehensive user guide for physics-enhanced PIRL model
- [ ] Retrain PIRL model with 21D state space and validate performance improvements