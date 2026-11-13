import unittest
from morphometry import pixel_scale_cm_per_px, joint_angle_deg, ellipse_perimeter, estimate

class MorphometryTests(unittest.TestCase):
    def test_pixel_scale(self):
        self.assertAlmostEqual(pixel_scale_cm_per_px(4,4000,6,4000),0.15,places=6)
    def test_right_angle(self):
        self.assertAlmostEqual(joint_angle_deg({'x':0,'y':0},{'x':1,'y':0},{'x':1,'y':1}),90,places=6)
    def test_ellipse_perimeter(self):
        self.assertGreater(ellipse_perimeter(.5,.6),1.7)
    def test_crevat_and_volume(self):
        slices=[{'width_px':367,'depth_mm':650} for _ in range(15)]
        result=estimate({'calibration':{'focal_mm':4,'distance_mm':4000,'sensor_width_mm':6,'image_width_px':4000},'body_length_px':1200,'slices':slices,'breed':'nelore','keypoints':{'A':{'x':0,'y':0},'B':{'x':1,'y':0},'C':{'x':1,'y':1}}})
        self.assertGreater(result['weight_estimate_kg'],100)
        self.assertEqual(result['joint_angles']['ABC_deg'],90)
    def test_missing_depth_rejected(self):
        with self.assertRaises(ValueError):
            estimate({'calibration':{'focal_mm':4,'distance_mm':4000,'sensor_width_mm':6,'image_width_px':4000},'body_length_px':1200,'slices':[]})

if __name__=='__main__': unittest.main()
